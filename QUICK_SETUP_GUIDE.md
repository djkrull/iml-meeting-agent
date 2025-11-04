# 🚀 Quick Setup Guide - Make Data Visible to Your Colleague

## ✅ What's Already Done

1. ✅ PostgreSQL database created on Railway
2. ✅ Database tables created (`programs`, `program_meetings`)
3. ✅ Backend code updated to use PostgreSQL
4. ✅ Frontend code updated to save/load from backend
5. ✅ SSL connection configured

## 🎯 What You Need to Do NOW

### Step 1: Set Frontend Environment Variable on Vercel

1. Go to https://vercel.com/dashboard
2. Select your IML Meeting project
3. Go to **Settings** → **Environment Variables**
4. Add this variable:
   ```
   Name: REACT_APP_API_URL
   Value: https://YOUR-RAILWAY-BACKEND-URL.railway.app
   ```
   **Important:** Replace `YOUR-RAILWAY-BACKEND-URL` with your actual Railway backend URL

5. Click **Save**

### Step 2: Find Your Railway Backend URL

1. Go to https://railway.app/dashboard
2. Click on your backend service
3. Look for the URL (something like: `iml-meeting-backend.up.railway.app`)
4. Copy this URL and use it in Step 1 above with `https://` prefix

### Step 3: Redeploy Frontend on Vercel

1. Go to **Deployments** tab in Vercel
2. Click the ⋯ menu on latest deployment
3. Click **Redeploy**
4. Wait for deployment to complete

### Step 4: Verify Railway Has DATABASE_URL

1. Go to Railway Dashboard
2. Click on your backend service
3. Go to **Variables** tab
4. Confirm `DATABASE_URL` exists (should be automatic when PostgreSQL is added)
5. If missing, Railway will add it automatically when you link the PostgreSQL service

---

## 🧪 Test Everything Works

1. Open your Vercel URL in browser
2. Upload an Excel file
3. Verify meetings appear
4. **Open same URL in incognito/private window** (or different browser)
5. You should see the SAME meetings
6. Have colleague open the same URL → they should see the same data

---

## 🎉 That's It!

Once you complete these 4 steps:
- ✅ All data stored in PostgreSQL (Railway)
- ✅ Data shared across all users
- ✅ Both you and your colleague see same meetings
- ✅ No more localStorage issues

---

## 📞 Quick Troubleshooting

**Problem:** Colleague can't see meetings
**Solution:** Check that REACT_APP_API_URL is set on Vercel and frontend is redeployed

**Problem:** Data not saving
**Solution:** Check Railway backend is running (check Railway dashboard)

**Problem:** Getting errors
**Solution:**
1. Check browser console (F12)
2. Check Railway logs (Railway dashboard → Deployments → Logs)
3. Verify DATABASE_URL is set on Railway

---

See `DEPLOYMENT_CHECKLIST.md` for detailed information.
