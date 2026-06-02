@echo off
REM EVE 制造利润分析器 - 一键部署脚本 (Windows PowerShell)
REM 使用方法:
REM   1. 先修改下面的服务器IP
REM   2. 在项目目录下执行: deploy.bat

set SERVER_IP=8.152.194.0
set SERVER_USER=xiaonaizhao
set REMOTE_DIR=/home/%SERVER_USER%/eve-profit

echo ========================================
echo   EVE 制造利润分析器 - 部署到服务器
echo   目标: %SERVER_USER%@%SERVER_IP%
echo   目录: %REMOTE_DIR%
echo ========================================

echo [1/4] 创建远程目录...
ssh %SERVER_USER%@%SERVER_IP% "mkdir -p %REMOTE_DIR%/core %REMOTE_DIR%/static %REMOTE_DIR%/data"

echo [2/4] 上传代码文件...
scp requirements.txt %SERVER_USER%@%SERVER_IP%:%REMOTE_DIR%/
scp main.py %SERVER_USER%@%SERVER_IP%:%REMOTE_DIR%/
scp core\__init__.py %SERVER_USER%@%SERVER_IP%:%REMOTE_DIR%/core/
scp core\database.py %SERVER_USER%@%SERVER_IP%:%REMOTE_DIR%/core/
scp core\market.py %SERVER_USER%@%SERVER_IP%:%REMOTE_DIR%/core/
scp core\calculator.py %SERVER_USER%@%SERVER_IP%:%REMOTE_DIR%/core/
scp static\index.html %SERVER_USER%@%SERVER_IP%:%REMOTE_DIR%/static/
scp static\style.css %SERVER_USER%@%SERVER_IP%:%REMOTE_DIR%/static/
scp static\app.js %SERVER_USER%@%SERVER_IP%:%REMOTE_DIR%/static/

echo [3/4] 服务器安装依赖...
ssh %SERVER_USER%@%SERVER_IP% "cd %REMOTE_DIR% && pip3 install -r requirements.txt"

echo [4/4] 下载 SDE 数据库...
echo      注意: 第一次需要从 GitHub 下载 401MB 的 SDE 数据库
echo      直接在服务器上执行:
echo.
echo      curl -L -o data/sde.sqlite.bz2 "https://github.com/garveen/eve-sde-converter/releases/download/sde-3365090-8a47eb7/sde.sqlite.bz2"
echo      cd data && bzip2 -d sde.sqlite.bz2
echo.
echo      或者启动服务后访问 http://%SERVER_IP%:2333/api/sde/update
echo.

echo [可选] 启动服务...
echo       ssh %SERVER_USER%@%SERVER_IP%
echo       cd %REMOTE_DIR%
echo       nohup python3 main.py ^> eve.log 2^>^&1 ^&
echo.
echo       查看日志: tail -f %REMOTE_DIR%/eve.log
echo       如果 2333 端口被占用，修改 main.py 中的 port=2333
echo.
echo ========================================
echo   部署完成！浏览器访问: http://%SERVER_IP%:2333
echo ========================================
pause
