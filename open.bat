@echo off

set URL=https://ftmo.itsarex.com/manage?symbol=EURUSD^&size=0.1
set DATA={\"Action\":\"FTMO Short\",\"TYPE\":\"V1\"}

curl -X POST "%URL%" ^
     -H "Content-Type: application/json" ^
     -d "%DATA%"

pause
