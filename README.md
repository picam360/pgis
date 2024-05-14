# pgis

## セットアップ
### サーバー
- wwwをサーバーに配置
- httpsで配信（httpだとgps取得でブラウザで弾かれる）

### スマホ
- chromeフラグ変更  
httpsのサイトからhttpの別サイト（theta api）にアクセスしたときにブラウザで弾かれないようために  
chrome://flags を開く  
Insecure origins treated as secureを検索  
テキストボックスにカメラのAPIのURLを入力　ex. http://THETAYR15104038.local  
フラグをenableに変更
---
## 使い方
### 撮影
- スマホでネットに繋がった状態でpgisサイトにアクセス https://storage.granbosque.net/pgis/
- wifiをカメラに接続
- takePictureボタンで撮影。撮影するとスマホにgpsファイルが保存される
### ファイル名変換
撮影画像のファイル名をgpsフォーマットに書き換える
- カメラから画像をパソコンにコピー
- スマホからgpsファイルをパソコンにコピー
- node bind_filename.js <IMG_DIR> <GPS_DIR> <OUT_DIR> を実行するとOUT_DIRに変換されたファイルが出力される