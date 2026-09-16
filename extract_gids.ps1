$text = Get-Content 'C:\Users\felipe.damasceno\.gemini\antigravity\brain\a29f70ef-7243-4c76-b5f7-cac97365340f\pubhtml.txt' -Raw
$regex = [regex]'id="sheet-button-(\d+)".*?>(.*?)</a>'
$matches = $regex.Matches($text)
foreach ($match in $matches) {
    Write-Host ($match.Groups[2].Value + ' : ' + $match.Groups[1].Value)
}
