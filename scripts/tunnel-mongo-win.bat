@echo off
REM ============================================================
REM  BHGT MongoDB 本地隧道（Windows 版）
REM  Mac/Linux 版见同目录 tunnel-mongo.sh
REM
REM  原理（ssh -L 本地转发）：
REM    在本机监听 47017，把流量经 SSH 隧道转发到
REM    服务器自身的 127.0.0.1:27017（线上 MongoDB 监听地址）。
REM    建立后，本机用 mongosh mongodb://localhost:47017
REM    即可像访问本地库一样访问线上库。
REM
REM  用法：
REM    1) 双击本文件（或在命令行执行 tunnel-mongo-win.bat）
REM    2) 保持这个黑窗口打开，隧道即生效
REM    3) 另开终端：mongosh mongodb://localhost:47017
REM    4) 用完直接关闭此窗口，隧道断开
REM
REM  前置条件：
REM    - Windows 10/11 自带 OpenSSH 客户端（ssh.exe 已在 PATH）。
REM      若提示找不到 ssh，请在「设置 -> 应用 -> 可选功能 -> 添加功能」
REM      中安装 "OpenSSH 客户端"。
REM    - 本机已能 SSH 登录 ubuntu@49.232.103.103（密钥或密码均可）。
REM      Windows 的密钥默认放在 C:\Users\你的用户名\.ssh\ 下。
REM ============================================================

where ssh >nul 2>nul
if errorlevel 1 (
    echo [ERROR] ssh command not found. Install OpenSSH Client first:
    echo   Settings -^> Apps -^> Optional features -^> Add a feature -^> OpenSSH Client
    pause
    exit /b 1
)

echo Establishing local tunnel  localhost:47017 -^> server:27017 ...
echo Keep this window open. Close it to disconnect the tunnel.
echo.

ssh -N -o ServerAliveInterval=30 -L 47017:127.0.0.1:27017 ubuntu@49.232.103.103

echo.
echo Tunnel disconnected.
pause
