#!/usr/bin/env node
/** test-usage-export.mjs (auto-mode batch 3, backlog #75): usage CSV export. */
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let p=0,f=0; const fl=[]; const ok=(c,m)=>{c?p++:(f++,fl.push(m));};
const read=(r)=>fs.readFileSync(path.join(ROOT,r),"utf8"); const ex=(r)=>fs.existsSync(path.join(ROOT,r));
{
  const rel="components/app/usage/UsageExportButton.tsx";
  ok(ex(rel), `${rel} exists`);
  const s=read(rel);
  ok(/^"use client";/m.test(s), "client component");
  ok(/from "@\/lib\/client\/csv"/.test(s) && /downloadCsv\(/.test(s), "uses the shared CSV helper");
  ok(/from "@\/lib\/client\/toast"/.test(s) && /toast\(/.test(s), "uses the toast system for feedback");
  ok(/rollup\.map|by_operation/.test(s) && /daily\.map|daily/.test(s), "exports both rollup + daily");
  ok(/rows\.length === 0/.test(s), "handles empty usage gracefully");
}
{
  const s=read("app/app/usage/page.tsx");
  ok(/import { UsageExportButton }/.test(s) && /<UsageExportButton /.test(s), "mounted on the usage page");
  ok(/rollup=\{rollup\.data\}/.test(s) && /daily=\{daily\.data\}/.test(s), "fed the server-computed rows");
}
console.log("");
if(f===0){console.log(`PASS — ${p} assertions`);console.log(`${p} passed, 0 failed`);process.exit(0);}
else{console.error("FAIL:");fl.forEach(m=>console.error("  "+m));console.log(`${p} passed, ${f} failed`);process.exit(1);}
