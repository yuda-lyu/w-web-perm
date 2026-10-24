# C 類外審(nemotron、beam)額度用盡紀錄

- nemotron(`opencode/nemotron-3.5-super-vl-free`, `--variant xhigh`, 匿名, `--print-logs --log-level ERROR`): 2026-10-24 18:51:39 UTC+8 起即回 `AI_APICallError: Free usage limit reached. Subscribe to OpenCode Go to keep going`; 依指示改派 beam。
- beam(`opencode/beam-free`, 同參數): 18:51:55 同字樣; beam 亦用盡不再派。兩行程樹皆已終止(`taskkill /F /T`), 回驗無 opencode 殘留行程。

```
> build · nemotron-3.5-super-vl-free

timestamp=2026-10-24T10:51:39.483Z level=ERROR run=3f42c53c message="stream error" providerID=opencode modelID=nemotron-3.5-super-vl-free session.id=ses_e92766413ffe8iPOrC562ejgtG small=false agent=build mode=primary error.error="AI_APICallError: Free usage limit reached. Subscribe to OpenCode Go to keep going: https://opencode.ai/go"
timestamp=2026-10-24T10:51:45.418Z level=ERROR run=3f42c53c message="stream error" providerID=opencode modelID=nemotron-3.5-super-vl-free session.id=ses_e92766413ffe8iPOrC562ejgtG small=true agent=title mode=primary error.error="AI_RetryError: Failed after 3 attempts. Last error: Free usage limit reached. Subscribe to OpenCode Go to keep going: https://opencode.ai/go"
```
