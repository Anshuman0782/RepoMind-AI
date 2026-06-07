import random
import string
import httpx
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from fastapi import APIRouter, HTTPException, Depends, status
from app.core.config import settings
from app.core.database import db
from app.core.security import get_current_user, hash_password, verify_password, create_jwt_token
from app.models.schemas import (
    UserRegisterRequest,
    UserLoginRequest,
    UserAuthResponse,
    TokenResponse,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    GitHubLoginRequest,
    UserProfileUpdateRequest,
    UserPasswordUpdateRequest,
)

router = APIRouter()

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

def to_user_response(user: dict) -> UserAuthResponse:
    return UserAuthResponse(
        id=user["_id"],
        username=user["username"],
        email=user["email"],
        has_github=bool(user.get("github_access_token")),
        github_user_login=user.get("github_user_login")
    )

@router.post("/signup", response_model=UserAuthResponse)
async def signup(payload: UserRegisterRequest) -> dict:
    email = payload.email.strip().lower()
    username = payload.username.strip()
    
    existing_user = await db.users.find_one({"$or": [{"email": email}, {"username": username}]})
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="A user with this email or username already exists."
        )
    
    user_id = str(uuid4())
    user = {
        "_id": user_id,
        "username": username,
        "email": email,
        "hashed_password": hash_password(payload.password),
        "github_access_token": None,
        "github_user_login": None,
        "github_user_id": None,
        "created_at": utc_now(),
    }
    await db.users.insert_one(user)
    return to_user_response(user)

@router.post("/login", response_model=TokenResponse)
async def login(payload: UserLoginRequest) -> dict:
    login_id = payload.email.strip().lower()
    user = await db.users.find_one({"$or": [{"email": login_id}, {"username": payload.email.strip()}]})
    if not user or not user.get("hashed_password") or not verify_password(payload.password, user["hashed_password"]):
        raise HTTPException(
            status_code=400,
            detail="Invalid email/username or password."
        )
    
    token = create_jwt_token({"user_id": user["_id"]})
    return {
        "access_token": token,
        "token_type": "Bearer",
        "user": to_user_response(user)
    }

@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest) -> dict:
    email = payload.email.strip().lower()
    user = await db.users.find_one({"email": email})
    
    # Generate 6 digit OTP
    otp = "".join(random.choices(string.digits, k=6))
    expiration = utc_now() + timedelta(minutes=15)
    
    await db.password_resets.update_one(
        {"email": email},
        {"$set": {"otp": otp, "expires_at": expiration}},
        upsert=True
    )
    
    # Send actual email if SMTP is configured, else fallback gracefully
    email_sent = False
    error_message = None

    if settings.smtp_host and settings.smtp_user and settings.smtp_password:
        try:
            import smtplib
            from email.mime.text import MIMEText
            from email.mime.multipart import MIMEMultipart

            msg = MIMEMultipart()
            msg["From"] = settings.smtp_user
            msg["To"] = email
            msg["Subject"] = f"RepoMind AI - Password Reset OTP [{otp}]"

            body = f"""Hello,

You requested a password reset for your RepoMind AI account.

Your 6-digit OTP code is: {otp}

You can also reset your password directly by clicking the link below:
http://localhost:3000/reset-password?email={email}&otp={otp}

This code and link will expire in 15 minutes.

If you did not request this reset, please ignore this email.

Best regards,
The RepoMind AI Team
"""
            msg.attach(MIMEText(body, "plain"))

            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port)
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.smtp_user, email, msg.as_string())
            server.quit()
            email_sent = True
        except Exception as e:
            error_message = str(e)
            print(f"SMTP Error sending reset to {email}: {e}")
    
    # Write details to file for local testing
    log_line = f"[{utc_now().isoformat()}] OTP: {otp} for {email} - Reset Link: http://localhost:3000/reset-password?email={email}&otp={otp} - SMTP Sent: {email_sent}\n"
    with open("recovery_emails.log", "a", encoding="utf-8") as f:
        f.write(log_line)
        
    print(f"\n========================================\nPASSWORD RECOVERY EMAIL (MOCKED):\nTo: {email}\nOTP Code: {otp}\nRecovery Link: http://localhost:3000/reset-password?email={email}&otp={otp}\n========================================\n")
    
    message = "If this email is registered, an OTP and reset link have been dispatched."
    if email_sent:
        message += " (Sent to your inbox successfully!)"
    else:
        if error_message:
            message += f" (Mail Delivery Failed: {error_message}. Fallback to recovery_emails.log)"
        else:
            message += " Check recovery_emails.log (SMTP is not configured in backend/.env)."
            
    return {
        "message": message,
        "email": email,
        "email_sent": email_sent
    }

@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest) -> dict:
    email = payload.email.strip().lower()
    reset_entry = await db.password_resets.find_one({"email": email})
    
    if not reset_entry or reset_entry["otp"] != payload.otp:
        raise HTTPException(
            status_code=400,
            detail="Invalid email or recovery OTP."
        )
        
    # Check expiration (if expires_at has timezone information, use utc_now() with tz)
    expires_at = reset_entry["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
        
    if expires_at < utc_now():
        raise HTTPException(
            status_code=400,
            detail="Recovery OTP has expired. Please request a new one."
        )
        
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"hashed_password": hash_password(payload.new_password), "updated_at": utc_now()}}
    )
    await db.password_resets.delete_one({"email": email})
    return {"message": "Password updated successfully. You can now log in."}

@router.post("/github/login", response_model=TokenResponse)
async def github_login(payload: GitHubLoginRequest) -> dict:
    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(
            status_code=400,
            detail="GitHub authentication is not configured in backend/.env"
        )
        
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            token_response = await client.post(
                "https://github.com/login/oauth/access_token",
                headers={"Accept": "application/json"},
                data={
                    "client_id": settings.github_client_id,
                    "client_secret": settings.github_client_secret,
                    "code": payload.code,
                },
            )
            token_response.raise_for_status()
            token_payload = token_response.json()
            access_token = token_payload.get("access_token")
            if not access_token:
                raise ValueError("GitHub did not return an access token.")

            headers = {
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {access_token}",
            }
            user_response = await client.get("https://api.github.com/user", headers=headers)
            user_response.raise_for_status()
            github_user = user_response.json()
            
            emails_response = await client.get("https://api.github.com/user/emails", headers=headers)
            github_email = None
            if emails_response.status_code == 200:
                for entry in emails_response.json():
                    if entry.get("primary") and entry.get("verified"):
                        github_email = entry.get("email")
                        break
            
            if not github_email:
                github_email = github_user.get("email") or f"{github_user['login']}@github.mock"
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"GitHub OAuth handshake failed: {str(exc)}")
        
    github_user_id = str(github_user["id"])
    user = await db.users.find_one({"$or": [{"github_user_id": github_user_id}, {"email": github_email.strip().lower()}]})
    
    if user:
        await db.users.update_one(
            {"_id": user["_id"]},
            {
                "$set": {
                    "github_access_token": access_token,
                    "github_user_login": github_user["login"],
                    "github_user_id": github_user_id,
                    "updated_at": utc_now(),
                }
            }
        )
        user = await db.users.find_one({"_id": user["_id"]})
    else:
        user_id = str(uuid4())
        user = {
            "_id": user_id,
            "username": github_user["login"],
            "email": github_email.strip().lower(),
            "hashed_password": None,
            "github_access_token": access_token,
            "github_user_login": github_user["login"],
            "github_user_id": github_user_id,
            "created_at": utc_now(),
        }
        await db.users.insert_one(user)
        
    token = create_jwt_token({"user_id": user["_id"]})
    return {
        "access_token": token,
        "token_type": "Bearer",
        "user": to_user_response(user)
    }

@router.get("/me", response_model=UserAuthResponse)
async def get_me(current_user: dict = Depends(get_current_user)) -> dict:
    return to_user_response(current_user)

@router.post("/link-github", response_model=UserAuthResponse)
async def link_github(payload: GitHubLoginRequest, current_user: dict = Depends(get_current_user)) -> dict:
    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(
            status_code=400,
            detail="GitHub authentication is not configured in backend/.env"
        )
        
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            token_response = await client.post(
                "https://github.com/login/oauth/access_token",
                headers={"Accept": "application/json"},
                data={
                    "client_id": settings.github_client_id,
                    "client_secret": settings.github_client_secret,
                    "code": payload.code,
                },
            )
            token_response.raise_for_status()
            token_payload = token_response.json()
            access_token = token_payload.get("access_token")
            if not access_token:
                raise ValueError("GitHub did not return an access token.")

            headers = {
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {access_token}",
            }
            user_response = await client.get("https://api.github.com/user", headers=headers)
            user_response.raise_for_status()
            github_user = user_response.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"GitHub account link failed: {str(exc)}")
        
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {
            "$set": {
                "github_access_token": access_token,
                "github_user_login": github_user["login"],
                "github_user_id": str(github_user["id"]),
                "updated_at": utc_now(),
            }
        }
    )
    updated_user = await db.users.find_one({"_id": current_user["_id"]})
    return to_user_response(updated_user)


@router.post("/profile/update", response_model=UserAuthResponse)
async def update_profile(
    payload: UserProfileUpdateRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    new_username = payload.username.strip()
    
    # Check if username is already taken by another user
    existing = await db.users.find_one({
        "username": new_username, 
        "_id": {"$ne": current_user["_id"]}
    })
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Username is already taken."
        )
        
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"username": new_username, "updated_at": utc_now()}}
    )
    
    updated = await db.users.find_one({"_id": current_user["_id"]})
    return to_user_response(updated)


@router.post("/profile/password")
async def update_password_endpoint(
    payload: UserPasswordUpdateRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    # If standard user, verify current password
    if current_user.get("hashed_password"):
        if not verify_password(payload.current_password, current_user["hashed_password"]):
            raise HTTPException(
                status_code=400,
                detail="Incorrect current password."
            )
            
    # Update password
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {
            "$set": {
                "hashed_password": hash_password(payload.new_password),
                "updated_at": utc_now()
            }
        }
    )
    return {"message": "Password updated successfully."}


@router.post("/profile/unlink-github", response_model=UserAuthResponse)
async def unlink_github(
    current_user: dict = Depends(get_current_user),
) -> dict:
    # Ensure they have standard credentials password before unlinking, so they don't lock themselves out!
    if not current_user.get("hashed_password"):
        raise HTTPException(
            status_code=400,
            detail="Please set a password under Profile settings before unlinking your GitHub account."
        )
        
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {
            "$set": {
                "github_access_token": None,
                "github_user_login": None,
                "github_user_id": None,
                "updated_at": utc_now()
            }
        }
    )
    
    updated = await db.users.find_one({"_id": current_user["_id"]})
    return to_user_response(updated)
