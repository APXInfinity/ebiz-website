#!/usr/bin/env python3
"""EBiZ Back Your Team: copy private Supabase intake into the owner's PRIVATE Google Drive.
Run from an authenticated backend/runner only. Never run in a browser, publish credentials,
print personal data, or write files into GitHub. The job is resumable and idempotent.

Requires google-api-python-client google-auth requests. OAuth token must be owned by
the Drive user, NOT a standalone Google service account uploading into personal My Drive.
"""
from __future__ import annotations
import hashlib
import logging
import os
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

import requests
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from googleapiclient.errors import HttpError

LOG = logging.getLogger("ebiz-drive-archive")
logging.basicConfig(level=logging.INFO,format="%(asctime)s %(levelname)s %(message)s")

@dataclass(frozen=True)
class Settings:
    sb_url: str
    sb_key: str
    google_id: str
    google_secret: str
    google_refresh: str
    video_folder: str
    consents_folder: str
    admin_folder: str

    @classmethod
    def load(cls):
        required = [
            "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
            "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET",
            "GOOGLE_OAUTH_REFRESH_TOKEN",
            "GDRIVE_VIDEO_FOLDER_ID", "GDRIVE_CONSENT_FOLDER_ID",
            "GDRIVE_ADMIN_FOLDER_ID",
        ]
        missing = [k for k in required if not os.environ.get(k)]
        if missing:
            raise RuntimeError("Missing required configuration keys: " + ", ".join(missing))
        return cls(*(os.environ[k].strip() for k in required))

def sha256_file(path: Path):
    h=hashlib.sha256()
    with path.open("rb") as fp:
        for part in iter(lambda:fp.read(2*1024*1024),b""):
            h.update(part)
    return h.hexdigest()

def md5_file(path: Path):
    h=hashlib.md5()  # noqa: S324 -- used ONLY to compare Drive's official md5Checksum, NOT for security
    with path.open("rb") as fp:
        for part in iter(lambda:fp.read(2*1024*1024),b""):
            h.update(part)
    return h.hexdigest()

def google_client(cfg:Settings):
    # Scope grants read/write to the owner's Drive; protect this refresh token strictly.
    # drive.file restricted scope is possible only after completing an app-specific
    # folder-picker grant / app-created-folder authorization workflow.
    creds=Credentials(
        token=None,
        refresh_token=cfg.google_refresh,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=cfg.google_id,
        client_secret=cfg.google_secret,
        scopes=["https://www.googleapis.com/auth/drive"],
    )
    creds.refresh(Request())
    return build("drive","v3",credentials=creds,cache_discovery=False)

def rest(cfg:Settings,method,path,*,params=None,json=None,stream=False):
    endpoint=cfg.sb_url.rstrip("/") + path
    headers={"Authorization":"Bearer "+cfg.sb_key,
             "apikey":cfg.sb_key}
    if method=="PATCH":
        headers["Prefer"]="return=representation"
    r=requests.request(method,endpoint,headers=headers,params=params,json=json,
                       stream=stream,timeout=(20,180))
    r.raise_for_status()
    return r

def candidates(cfg:Settings):
    r=rest(cfg,"GET","/rest/v1/team_sponsor_submissions",
      params={
        "select":"id,receipt,status,submitted_at,video_path,consents_path,endorsement_path",
        "status":"in.(submitted_pending_review,approved,winner)",
        "drive_archived_at":"is.null",
        "order":"submitted_at.asc","limit":"30",
      })
    return r.json()

def download(cfg:Settings,path:str,out_path:Path,limit:int):
    # A file is kept private in Supabase; read with server-only service key.
    encoded="/".join(quote(p,safe="") for p in path.split("/"))
    url="/storage/v1/object/authenticated/team-entry-private/"+encoded
    with rest(cfg,"GET",url,stream=True) as r:
        total=0
        with out_path.open("wb") as dest:
            for part in r.iter_content(chunk_size=2*1024*1024):
                if not part:
                    continue
                total+=len(part)
                if total > limit: raise ValueError("Uploaded object exceeds permitted cap")
                dest.write(part)
    if total<=0:raise ValueError("Uploaded object was empty")
    return total

def find_existing(drive,folder_id:str,name:str):
    safe=name.replace("\\","\\\\").replace("'","\\'")
    query=f"name = '{safe}' and '{folder_id}' in parents and trashed = false"
    data=drive.files().list(q=query,fields="nextPageToken,files(id,name,size,md5Checksum,mimeType,parents)",
                 page_size=30).execute()
    items=data.get("files",[])
    if len(items)>1:
        raise RuntimeError("Multiple Drive files with the same receipt filename; manual review required")
    return items[0] if items else None

def upload_or_verify(drive,folder_id:str,name:str,file_path:Path,mime:str):
    digest=md5_file(file_path)
    existing=find_existing(drive,folder_id,name)
    if existing:
        if (existing.get("md5Checksum") or "").lower()!=digest or int(existing.get("size",0))!=file_path.stat().st_size:
            raise RuntimeError("Drive file exists with different checksum; manual review required")
        return existing["id"],existing["md5Checksum"]
    media=MediaFileUpload(str(file_path),mimetype=mime,resumable=True,chunksize=2*1024*1024)
    request=drive.files().create(body={"name":name,"mimeType":mime,"parents":[folder_id]},
        media_body=media,fields="id,name,size,md5Checksum,mimeType,parents",supportsAllDrives=False)
    result=None
    retries=0
    while result is None:
        try:
            _,result=request.next_chunk(num_retries=3)
        except HttpError as err:
            retries+=1
            if retries>=5 or err.resp.status not in (429,500,502,503,504):
                raise
            time.sleep(min(30,2**retries))
    if (result.get("md5Checksum") or "").lower()!=digest:
        raise RuntimeError("Google Drive checksum verification FAILED — do not mark archived")
    if int(result.get("size",0))!=file_path.stat().st_size:
        raise RuntimeError("Google Drive size verification FAILED")
    return result["id"],result["md5Checksum"]

def archive(cfg:Settings,drive,row:dict):
    receipt=row["receipt"]
    # Receipt is generated by the server; no team or minor name in filenames.
    if not isinstance(receipt,str) or not receipt.startswith("EBT27-"):
        raise ValueError("Invalid receipt")
    files=[
        ("video",row["video_path"],cfg.video_folder,receipt+"__VIDEO.mp4","video/mp4",45*1024*1024),
        ("consents",row["consents_path"],cfg.consents_folder,receipt+"__SIGNED-CONSENTS.pdf","application/pdf",20*1024*1024),
        ("endorsement",row["endorsement_path"],cfg.consents_folder,
         receipt+"__TEAM-AUTHORIZATION.pdf","application/pdf",10*1024*1024),
    ]
    output={}
    for kind,remote,folder,name,mime,limit in files:
        with tempfile.TemporaryDirectory(prefix="ebiz-intake-") as tmp:
            path=Path(tmp)/("upload.mp4" if kind=="video" else "upload.pdf")
            size=download(cfg,remote,path,limit)
            sha=sha256_file(path)
            file_id,drive_md5=upload_or_verify(drive,folder,name,path,mime)
            output[kind]={"file_id":file_id,"size":size,"sha256":sha,"drive_md5":drive_md5}
    # Only completed, checksum-verified archives are marked as archived.
    stamped=time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())
    update=rest(cfg,"PATCH","/rest/v1/team_sponsor_submissions",
        params={"id":"eq."+str(row["id"]),"drive_archived_at":"is.null"},
        json={"drive_file_ids":output,"drive_archived_at":stamped})
    if len(update.json())!=1:
        raise RuntimeError("Archive marked with an unexpected number of updated records")
    return True

def main():
    cfg=Settings.load()
    drive=google_client(cfg)
    rows=candidates(cfg)
    total=0
    failures=0
    for row in rows:
        try:
            archive(cfg,drive,row)
            total+=1
            LOG.info("Verified and archived receipt %s",str(row.get("receipt",""))[:20])
        except Exception as exc:
            failures+=1
            # Do not print response bodies or private file metadata in logs.
            LOG.error("Archive failed for record %s: %s",str(row.get("id",""))[:8],type(exc).__name__)
    LOG.info("Completed: %d verified, %d failed",total,failures)
    if failures:
        raise SystemExit(2)

if __name__=="__main__":
    main()
