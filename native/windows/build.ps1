$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path $compiler)) { throw '.NET Framework 4.x compiler is required.' }
$outDir = Join-Path $PSScriptRoot '..\bin'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$outFile = Join-Path $outDir 'quill-speech.exe'
Add-Type -AssemblyName System.Speech
$speechAssembly = [System.Speech.Recognition.SpeechRecognitionEngine].Assembly.Location
& $compiler /nologo /target:exe /platform:x64 "/r:$speechAssembly" /r:System.Web.Extensions.dll "/out:$outFile" (Join-Path $PSScriptRoot 'QuillSpeech.cs')
if ($LASTEXITCODE -ne 0) { throw 'Windows speech helper compilation failed.' }
& $outFile --self-test
if ($LASTEXITCODE -ne 0) { throw 'Windows speech helper self-test failed.' }
