@echo off
rem ParkSmart local launcher (Windows): database in WSL + website on http://localhost:3000
setlocal
cd /d "%~dp0"

if not exist node_modules (
  echo Installing packages...
  call npm install || goto :error
)

echo Starting the local database (Supabase in WSL Ubuntu)...
start "ParkSmart database - keep this window open" /min wsl -u root --cd "%~dp0" -e bash -c "systemctl start docker && supabase start -x edge-runtime,logflare,vector,supavisor,imgproxy && echo Database ready. Keep this window open. && exec sleep infinity"

echo Waiting for the database to be ready...
powershell -NoProfile -Command "$ok=$false; for($i=0;$i -lt 120;$i++){ try { if((Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://127.0.0.1:54321/auth/v1/health).StatusCode -eq 200){$ok=$true;break} } catch {}; Start-Sleep 2 }; if(-not $ok){ exit 1 }" || goto :dberror

echo Database is up. Starting the website...
start "" http://localhost:3000
call npm run dev
goto :eof

:dberror
echo.
echo The database did not start. Open the "ParkSmart database" window to see why.
pause
goto :eof

:error
echo.
echo Something went wrong. See the messages above.
pause
