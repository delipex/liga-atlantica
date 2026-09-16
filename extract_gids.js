const fs = require('fs');
const text = fs.readFileSync('C:\\Users\\felipe.damasceno\\.gemini\\antigravity\\brain\\a29f70ef-7243-4c76-b5f7-cac97365340f\\pubhtml.txt', 'utf8');
const regex = /id="sheet-button-(\d+)".*?>(.*?)<\/a>/g;
let match;
while ((match = regex.exec(text)) !== null) {
  console.log(`${match[2]}: ${match[1]}`);
}
