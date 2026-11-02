/** GitHub Pages 构建：生成 out/ 目录，basePath = /tax-helper */
import { spawnSync } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";

const BASE = process.env.BASE_PATH || "/tax-helper";

const res = spawnSync("next", ["build"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NEXT_PUBLIC_BASE_PATH: BASE },
});

if (res.status !== 0) process.exit(res.status ?? 1);

// GitHub Pages 默认跑 Jekyll，会忽略 _next 目录
if (existsSync("out")) {
  writeFileSync("out/.nojekyll", "");
  console.log(`\n✔ 静态站点已生成到 out/（basePath: ${BASE}）`);
}
