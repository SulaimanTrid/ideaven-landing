$env:Path = "C:\Users\Jendela 10\Downloads\Projek IDEAVEN\ideaven-v7\tools\pgsql\bin;" + $env:Path
$pgData = "C:\Users\Jendela 10\Downloads\Projek IDEAVEN\ideaven-v7\tools\pgdata"
$status = & pg_ctl -D $pgData status
if ($LASTEXITCODE -ne 0) {
  & pg_ctl -D $pgData -l "$pgData\server.log" start
  Start-Sleep -Seconds 4
  & pg_ctl -D $pgData status
}
