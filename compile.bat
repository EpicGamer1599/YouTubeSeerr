@echo off
setlocal
pushd "%~dp0" || exit /b 1
if /i "%~1"=="--docker" goto docker
if not "%~1"=="" goto usage

where node >nul 2>&1
if errorlevel 1 goto node_required
node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 15) ? 0 : 1)"
if errorlevel 1 goto node_required
echo Installing locked dependencies and compiling YouTubeSeerr...
call npm ci --include=dev
if errorlevel 1 goto failed
call npm run build
if errorlevel 1 goto failed
echo.
echo Build complete. Compiled files are in dist.
echo Run npm start and npm run worker in separate terminals.
goto done

:docker
where docker >nul 2>&1
if errorlevel 1 goto docker_required
docker compose build
if errorlevel 1 goto failed
echo.
echo Docker build complete. Run docker compose up -d to start both services.
goto done

:node_required
echo Node.js 22.15 or later with npm is required. See START-HERE.md.
goto failed

:docker_required
echo Docker Engine or Desktop with Compose v2 is required. See START-HERE.md.
goto failed

:usage
echo Usage: compile.bat [--docker]
goto failed

:failed
echo Build failed. Review the error above.
popd
exit /b 1

:done
popd
exit /b 0
