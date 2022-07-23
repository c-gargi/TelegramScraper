# TelegramScraper


#### A node js script to scrape all messages from Telegram channels, save them in file and store the file in AWS S3 bucket

* **You will need to set following environment variables**

    * TELEGRAM_PHONE_NUMBER= <Your Number>
	* TELEGRAM_APP_ID=<Telegram APP Id>
	* TELEGRAM_APP_HASH=<Telegram App hash>
	* SERVER_URL_DEV=YOUR DEV URL
	* SERVER_URL_PROD=YOUR PROD URL
	* DELAY=60000
	* DIALOG_LIMIT=100
	* MESSAGE_LIMIT=100
	* BUCKET=<Bucket Name>
	* AWS_ACCESS_KEY=<AWS Access Key>
	* AWS_SECRET_ACCESS_KEY=<AWS Secret Key>
	* CALL_INTERVAL=86400000
