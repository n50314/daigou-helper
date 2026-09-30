@echo off
:: 切換到此檔案所在的目錄，確保執行路徑正確
cd /d "%~dp0"

echo ==============================
echo 1. 正在編譯網頁 (Build)...
echo ==============================
:: 注意：前面一定要加 call，不然執行完 npm 視窗就會關閉
call npm run build

:: 簡單檢查：如果編譯失敗(有錯誤)，就暫停並不要執行上傳
if %errorlevel% neq 0 (
    echo [錯誤] 編譯失敗，請檢查程式碼！
    pause
    exit /b
)

echo.
echo ==============================
echo 2. 正在上傳至 Firebase...
echo ==============================
call firebase deploy --only "hosting,firestore:rules" --project daigo-2d168
if %errorlevel% neq 0 (
    echo Firebase deployment failed.
    pause
    exit /b 1
)

echo.
echo ==============================
echo       全部完成！(Done)
echo ==============================
pause
