const fs = require("fs")
const p =
  "C:/Users/LukeFitzpatrick/.cursor/projects/c-Projects-avmediaplan/agent-transcripts/29063e52-4c73-4b03-a3e9-5dc26028c9d4/29063e52-4c73-4b03-a3e9-5dc26028c9d4.jsonl"
const line = fs.readFileSync(p, "utf8").split(/\n/)[0]
const t = JSON.parse(line).message.content[0].text
const i = t.indexOf("Part 2")
fs.writeFileSync("scripts/_part2_slice.txt", t.slice(i, i + 15000))
console.log("wrote", i, "len", t.length)
