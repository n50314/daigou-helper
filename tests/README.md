# 測試操作

完整測試指令與環境設定見 [專案 README](../README.md#測試)，驗證結果見 [驗證紀錄](../docs/validation.md)。

- `npm test`：業務與同步單元測試。
- `npm run test:ui`：390、768、1440px 介面、觸控分類、搜尋、Excel 與歷史規格。
- `npm run test:purchase`：採購篩選、勾選與檔期隔離。
- `npm run test:upgrade`：草稿、商品編輯、封存、分類移轉、成本與未歸檔資料。
- `npm run test:accounts`：Firebase Auth／Firestore Emulators 的帳號及多裝置測試。

瀏覽器測試使用獨立訪客環境及虛構資料；帳號測試使用 `demo-daigou-sync` 模擬器，不在正式帳號建立測試訂單。手機操作是 Chrome 模擬觸控，沒有宣稱完成實體 iPhone Safari 驗證。

預覽服務須啟動於 `http://127.0.0.1:4173`。指定 `TEST_URL` 可對正式站執行同一組訪客測試。一般回歸截圖輸出至 `test-results/`，公開示範截圖輸出至 `docs/images/`。
