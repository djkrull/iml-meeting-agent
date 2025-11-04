# IML Meeting Booking Agent - Deployment Checklist

## ✅ Backend (Railway) - COMPLETED

Your backend is deployed on Railway and uses PostgreSQL for shared data storage.

### Railway Environment Variables

Railway should **automatically** set these when you add a PostgreSQL database:
- ✅ `DATABASE_URL` (auto-generated when you add PostgreSQL database service)
- ✅ `DATABASE_PUBLIC_URL` - Your value: `postgresql://postgres:qRPQZGbRtCuyHtEMgKCXhcBTpMapaLqS@yamanote.proxy.rlwy.net:22802/railway`

**Action Required:** Verify in Railway dashboard:
1. Go to Railway Dashboard → Your Backend Service → Variables
2. Confirm `DATABASE_URL` is set (should be automatic when PostgreSQL is added)
3. Optional: You can also manually set `PORT=8080` (Railway usually sets this automatically)

### Database Tables Status
- ✅ PostgreSQL connection: **VERIFIED**
- ✅ `programs` table: **CREATED**
- ✅ `program_meetings` table: **CREATED**
- ✅ `reviews` table: **EXISTS**
- ✅ `meetings` table: **EXISTS**
- ✅ `approvals` table: **EXISTS**

### Railway Deployment
Your backend is configured to run:
```bash
node server/index.js
```

When your server starts on Railway with `DATABASE_URL` set, it will:
1. ✅ Automatically connect to PostgreSQL (not SQLite)
2. ✅ Create tables if they don't exist
3. ✅ Store all programs and meetings in PostgreSQL

---

## 🔧 Frontend (Vercel) - ACTION REQUIRED

Your frontend needs to know where the backend is deployed.

### Vercel Environment Variables

**Required:** Set this in Vercel Dashboard → Your Project → Settings → Environment Variables:

```
REACT_APP_API_URL=https://your-railway-backend.railway.app
```

**Replace** `your-railway-backend.railway.app` with your actual Railway backend URL.

**How to find your Railway backend URL:**
1. Go to Railway Dashboard
2. Click on your backend service
3. Go to "Settings" tab
4. Look for "Domains" section
5. Copy the Railway-provided domain (e.g., `iml-meeting-backend.up.railway.app`)

### Steps to update Vercel:
1. Go to https://vercel.com/dashboard
2. Select your IML Meeting project
3. Go to **Settings** → **Environment Variables**
4. Add new variable:
   - **Name:** `REACT_APP_API_URL`
   - **Value:** `https://your-railway-backend.up.railway.app` (your actual Railway URL)
   - **Environment:** Select all (Production, Preview, Development)
5. Click **Save**
6. Go to **Deployments** tab
7. Click **Redeploy** on the latest deployment

---

## 🔍 How to Verify Everything Works

### 1. Test Backend API (Railway)
Open in browser or use curl:
```
https://your-railway-backend.up.railway.app/api/health
```

Should return:
```json
{"status":"ok","message":"IML Meeting Review Server is running"}
```

### 2. Test Database Connection
Check the Railway logs:
```
Go to Railway Dashboard → Your Backend Service → Deployments → View Logs
```

You should see:
```
Review server running on port XXXX
API available at http://...
Using PostgreSQL database
PostgreSQL tables initialized
```

### 3. Test Frontend (Vercel)
1. Open your Vercel URL
2. Upload an Excel file with programs
3. Verify meetings are generated
4. Open the same URL in a **different browser** or **incognito mode**
5. You should see the same meetings (loaded from PostgreSQL)

### 4. Test with Colleague
1. Have your colleague open the Vercel URL
2. They should see the same programs and meetings you uploaded
3. Changes made by either person should be visible to both

---

## 🔄 Data Flow

```
User Uploads Excel (Browser)
        ↓
Frontend (Vercel) processes Excel
        ↓
Frontend calls: POST /api/programs
        ↓
Backend (Railway) receives data
        ↓
Data saved to PostgreSQL (Railway)
        ↓
All users see same data when they load the page
```

---

## 📝 Current Database Details

**Railway PostgreSQL Database:**
- Host: `yamanote.proxy.rlwy.net`
- Port: `22802`
- Database: `railway`
- Connection: ✅ **VERIFIED AND WORKING**

**Current Data:**
- Programs: 0 (upload Excel to add data)
- Meetings: 0 (will be generated when programs are uploaded)

---

## 🚀 Quick Deployment Commands

If you need to redeploy:

### Backend (Railway)
```bash
git add .
git commit -m "Update backend"
git push
```
Railway auto-deploys from your Git repository.

### Frontend (Vercel)
```bash
git add .
git commit -m "Update frontend"
git push
```
Vercel auto-deploys from your Git repository.

---

## ⚠️ Important Notes

1. **SQLite is only for local development** - Your deployed backend uses PostgreSQL
2. **localStorage is only a fallback** - Main storage is PostgreSQL
3. **Both users must access the same Vercel URL** to see shared data
4. **Backend must be running on Railway** for data sharing to work
5. **DATABASE_URL must be set on Railway** (automatic when PostgreSQL database is added)

---

## ✅ Final Checklist

- [x] PostgreSQL database created on Railway
- [x] Database tables created
- [x] Backend deployed on Railway
- [x] Backend environment variables set (DATABASE_URL)
- [ ] **TODO:** Frontend environment variable set on Vercel (REACT_APP_API_URL)
- [ ] **TODO:** Frontend redeployed on Vercel
- [ ] **TODO:** Test with colleague

---

## 🆘 Troubleshooting

### Issue: Colleague can't see my meetings

**Check:**
1. Is backend running? Check Railway logs
2. Is DATABASE_URL set on Railway? Check environment variables
3. Is REACT_APP_API_URL set on Vercel? Check environment variables
4. Did you redeploy Vercel after setting the environment variable?
5. Are you both accessing the same URL?

### Issue: Meetings not persisting

**Check:**
1. Check browser console (F12) for errors
2. Check Railway logs for database errors
3. Verify DATABASE_URL is correct
4. Test backend API health endpoint

### Issue: "Failed to save to backend"

**Check:**
1. Is Railway backend running?
2. Check Railway logs for errors
3. Verify CORS is enabled (already configured)
4. Check REACT_APP_API_URL is correct in Vercel

---

Need help? Check Railway and Vercel logs for detailed error messages.
