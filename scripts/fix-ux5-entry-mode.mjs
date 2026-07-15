import fs from "node:fs"
import path from "node:path"

const DIR = path.join(process.cwd(), "components/media-containers")

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith("Container.tsx"))) {
  const fp = path.join(DIR, file)
  let s = fs.readFileSync(fp, "utf8")
  const before = s

  // Ensure "use client" is the first statement
  if (s.includes('"use client"')) {
    s = s.replace(/"use client"\r?\n/g, "")
    s = '"use client"\n\n' + s.trimStart()
  }

  // Drop unused shared toggle import
  s = s.replace(
    /import \{ ContainerEntryModeToggle \} from "@\/components\/media-containers\/ContainerEntryModeToggle"\r?\n/g,
    ""
  )
  s = s.replace(/,\s*type ContainerEntryMode/g, "")

  // Ensure write/read import exists after use client
  if (!s.includes("writeContainerEntryMode")) {
    s = s.replace(
      '"use client"\n\n',
      `"use client"\n\nimport {\n  readContainerEntryMode,\n  writeContainerEntryMode,\n} from "@/lib/mediaplan/containerEntryMode"\n`
    )
  }

  // Fix broken brace indentation from write injection
  s = s.replace(
    /writeContainerEntryMode\("card"\)\r?\n(\s*)handle(\w+ExpertModalOpenChange\(false\))\r?\n(\s*)\}/g,
    'writeContainerEntryMode("card")\n$1handle$2\n$1}'
  )

  // Add session reopen effect once per openXxxExpertModal if missing
  if (!s.includes("/* ux5-session-")) {
    const openFns = [...s.matchAll(/const (open\w+ExpertModal)\s*=\s*useCallback/g)].map((m) => m[1])
    const modalOpens = [...s.matchAll(/const \[(\w+ExpertModalOpen),/g)].map((m) => m[1])

    for (let i = 0; i < openFns.length; i++) {
      const openFn = openFns[i]
      const modalOpen = modalOpens[i] || modalOpens[0]
      if (!openFn || !modalOpen) continue

      const marker = `/* ux5-session-${modalOpen} */`
      if (s.includes(marker)) continue

      const idx = s.indexOf(`const ${openFn}`)
      if (idx < 0) continue
      // end of useCallback: find `}, [deps])` after idx
      let searchFrom = idx
      let inserted = false
      while (searchFrom < s.length) {
        const deps = s.indexOf("}, [", searchFrom)
        if (deps < 0) break
        const closeParen = s.indexOf(")", deps)
        if (closeParen < 0) break
        // Heuristic: this should be near openFn (within ~4k)
        if (deps - idx > 4000) break
        const end = closeParen + 1
        const effect = `

  ${marker}
  useEffect(() => {
    if (readContainerEntryMode() !== "schedule") return
    if (${modalOpen}) return
    ${openFn}()
    // mount-only: honour session entry preference
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
`
        s = s.slice(0, end) + effect + s.slice(end)
        inserted = true
        break
      }
      if (!inserted) console.warn("no effect for", file, openFn)
    }
  }

  if (s !== before) {
    fs.writeFileSync(fp, s)
    console.log("fixed", file)
  } else {
    console.log("ok", file)
  }
}
