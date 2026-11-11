param([string]$ImagePath)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime] | Out-Null

$asTaskMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*'
} | Select-Object -First 1

function Await-WinRt($op, [Type]$resultType) {
  $task = $asTaskMethod.MakeGenericMethod($resultType).Invoke($null, @($op))
  $task.GetAwaiter().GetResult()
}

$fs = [System.IO.File]::OpenRead($ImagePath)
try {
  $stream = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($fs)
  $decoder = Await-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await-WinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if ($null -eq $engine) {
    $langs = [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages
    if ($langs.Count -gt 0) {
      $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($langs[0])
    }
  }
  if ($null -eq $engine) {
    [PSCustomObject]@{ language = $null; text = ""; lines = @(); error = "No WinRT OCR recognizer language installed." } | ConvertTo-Json -Depth 4
    exit 0
  }
  $result = Await-WinRt ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $lines = @()
  foreach ($line in $result.Lines) {
    $lines += [PSCustomObject]@{ text = $line.Text; wordCount = $line.Words.Count }
  }
  [PSCustomObject]@{
    language = $engine.RecognizerLanguage.LanguageTag
    text = $result.Text
    lines = $lines
    error = $null
  } | ConvertTo-Json -Depth 4
} finally {
  $fs.Dispose()
}

