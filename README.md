# ray-voice

讓 Claude Code 跟 Codex 用 Ray 的語氣跟思考模式跟你講話的 agent skill。

它管的是「怎麼講」，不是「做什麼」。你原本的開發流程、review 流程、寫文件流程通通不用改，ray-voice 疊在上面，只負責把輸出從「專案報告」變成「坐在你旁邊的朋友在跟你解釋」。

裝好之後，同一個問題你會拿到這種回答：

<!-- check-voice-disable -->

沒裝的時候，AI 大概會這樣講：

> 在當今的容器化技術中，Image 與 Container 的區別至關重要。Image 是唯讀的模板，Container 是其執行實例。綜上所述，兩者為一對多關係。

<!-- check-voice-enable -->

裝了之後：

> Image 絕對不是在指圖片，而是 Docker 的映像檔，而且是唯讀的。如果你有燒過光碟的話，可以把它想像成那片光碟；那 Container 呢？就是把光碟放進光碟機、真的跑起來的那個狀態。

差別不只是語尾詞。它還會逼 AI 做這幾件事：結論先講、抽象概念一定配生活比喻、貼完程式碼要翻回中文、需求不清楚先問到清楚再動工、不確定的事直接說不確定。所有中文一律繁體台灣用語與全形標點。

完整規範在 [SKILL.md](SKILL.md)，用語對照表在 [references/zh-tw.md](references/zh-tw.md)。

---

## 安裝

Claude Code 跟 Codex 的 skill 格式一模一樣，都是一個資料夾裡面放 `SKILL.md`，差別只在放的位置：

| 工具 | 全域位置 | 專案內位置 |
| ------ | ------ | ------ |
| Claude Code | `~/.claude/skills/ray-voice/` | `<專案>/.claude/skills/ray-voice/` |
| Codex | `~/.codex/skills/ray-voice/` | 目前建議用全域 |

所以你有兩種裝法，挑一種就好。

### 裝法一：clone 一份，兩邊都 symlink（推薦）

好處是只有一份原始檔，之後 `git pull` 一次，Claude 跟 Codex 同時更新。

```bash
# 1. 抓一份回來，放哪都可以，這邊放 ~/GitHub
git clone https://github.com/hsiangfeng/Ray-Voice-SKILL.git ~/GitHub/Ray-Voice-SKILL

# 2. 掛進 Claude Code
mkdir -p ~/.claude/skills
ln -sfn ~/GitHub/Ray-Voice-SKILL ~/.claude/skills/ray-voice

# 3. 掛進 Codex
mkdir -p ~/.codex/skills
ln -sfn ~/GitHub/Ray-Voice-SKILL ~/.codex/skills/ray-voice
```

只用其中一個工具的話，第 2 步或第 3 步跳過即可。

### 裝法二：直接 clone 進 skills 資料夾

不想搞 symlink 就這樣，缺點是更新要各自 pull 一次。

```bash
# Claude Code
git clone https://github.com/hsiangfeng/Ray-Voice-SKILL.git ~/.claude/skills/ray-voice

# Codex
git clone https://github.com/hsiangfeng/Ray-Voice-SKILL.git ~/.codex/skills/ray-voice
```

### 只想在某一個專案生效

Claude Code 讀專案內的 `.claude/skills/`，所以進到那個專案下面裝就好，不會污染你其他專案：

```bash
mkdir -p .claude/skills
git clone https://github.com/hsiangfeng/Ray-Voice-SKILL.git .claude/skills/ray-voice
```

要把它一起進版控的話記得處理 `.gitignore`，不然 clone 下來的 `.git` 會變成 submodule 的麻煩。最省事的做法是 clone 完把裡面的 `.git` 刪掉，當一般檔案 commit 進去。

### Windows

PowerShell 版本，路徑換成 `$env:USERPROFILE`：

```powershell
git clone https://github.com/hsiangfeng/Ray-Voice-SKILL.git $env:USERPROFILE\.claude\skills\ray-voice
git clone https://github.com/hsiangfeng/Ray-Voice-SKILL.git $env:USERPROFILE\.codex\skills\ray-voice
```

Windows 的 symlink 要開發者模式或系統管理員權限才建得起來，所以在 Windows 上我建議直接用裝法二。

---

## 確認裝好了

Claude Code：重開一個 session，輸入 `/`，清單裡面應該找得到 `ray-voice`。

Codex：跑這行，有輸出就是有吃到（這個指令只是把 model 看得到的內容印出來，不會真的送出任何 request）。

```bash
codex debug prompt-input | grep ray-voice
```

兩個都沒反應的話，先檢查路徑對不對、資料夾裡面有沒有 `SKILL.md`：

```bash
ls -la ~/.claude/skills/ray-voice/SKILL.md ~/.codex/skills/ray-voice/SKILL.md
```

---

## 怎麼用

### 平常不用做什麼

skill 的 description 裡面寫了觸發條件是「每一次回覆」，所以正常情況下你直接講話就好，它會自己套。

### 想要它每次都一定生效

skill 是 AI 自己判斷要不要載入的，偶爾會漏。你要它 100% 每次都套，就在全域指令檔加一行，這樣它變成硬規則：

Claude Code 寫進 `~/.claude/CLAUDE.md`：

```markdown
所有對我的回覆一律套用 ray-voice skill 的語氣與思考模式。
```

Codex 寫進 `~/.codex/AGENTS.md`：

```markdown
所有對我的回覆一律套用 ray-voice skill 的語氣與思考模式。
```

只想在某個專案這樣搞的話，就寫進那個專案的 `CLAUDE.md` 或 `AGENTS.md`。

### 它又開始講 AI 話的時候

直接跟它講「重讀 ray-voice」「你講話太 AI 了」「這段不像人」，它會回去重看規範再修一次。這是 skill 裡面就寫好的校正入口。

### 想單獨叫它出來

Claude Code 打 `/ray-voice`，Codex 也是 `/ray-voice`。適合你要它專門幫你改一段文字的語氣、而不是改整個對話風格的時候。

---

## 驗證器：check-voice.mjs

語氣規範不靠記憶，靠跑一次。`scripts/check-voice.mjs` 零依賴、Node 18 以上就能跑，讀 `assets/voice-profile.json` 當規則來源。

### 基本用法

```bash
# 驗一段文字
node ~/.claude/skills/ray-voice/scripts/check-voice.mjs -m "這個功能蠻不錯的，用戶可以透過緩存來提升效能。"

# 驗一份 markdown
node scripts/check-voice.mjs draft.md

# 驗一整批
node scripts/check-voice.mjs "content/**/*.md"

# 從 stdin 讀
echo "文字" | node scripts/check-voice.mjs -
```

選項：

| 選項 | 作用 |
| ------ | ------ |
| `--mode doc\|chat\|auto` | 預設 auto：`.md` 檔走 doc（多驗標題深度、code fence 語言、表格分隔線），`-m` 跟 stdin 走 chat |
| `--strict` | warning 也算失敗，適合放 CI |
| `--json` | 輸出 JSON，給程式接 |
| `--profile <path>` | 指定自己的 voice-profile.json |
| `--help` | 說明 |

### 輸出長這樣

```text
(-m)  [chat]  21 中文字
  ✖ L1  大陸用語「緩存」→「快取」
      這個功能蠻不錯的，用戶可以透過緩存來提升效能。
      → 改台灣用語；語境陷阱與完整對照表出處見 references/zh-tw.md
  ✖ L1  大陸用語「用戶」→「使用者」
      這個功能蠻不錯的，用戶可以透過緩存來提升效能。
  ✖ L1  一律寫「滿」不寫「蠻」：「蠻」→「滿」
      這個功能蠻不錯的，用戶可以透過緩存來提升效能。
  小計：error 3／warning 0／info 0
```

`✖` 是 error 一定要改，`▲` 是 warning 看語境自己判斷。

### 它抓得到跟抓不到的

<!-- check-voice-disable-next-line -->
抓得到：簡體字、大陸用語、AI 腔套語、慣用寫法（蠻→滿、簡單來說→簡單來講）、emoji、中英之間漏空格、半形標點、句子過長、段落太厚、第一人稱密度太低。

抓不到：比喻自不自然、有沒有把對方當完全沒背景的人在解釋、程式碼有沒有翻回中文、該問的有沒有問。這幾項還是要人看。

### 遇到誤判

討論規範本身的文件會逐字引用被禁的詞，那不是違規。用註解關掉：

```markdown
<!-- check-voice-disable-next-line -->
這一行裡面出現「總而言之」不會被抓。

<!-- check-voice-disable -->
這整個區塊都不檢查。
<!-- check-voice-enable -->
```

### 結束碼

| 碼 | 意思 |
| ------ | ------ |
| 0 | 全過 |
| 1 | 有 error（`--strict` 下 warning 也算） |
| 2 | 用法錯誤 |

拿去接 CI 或 git hook 就是看這個。

### 跑驗證器自己的測試

```bash
node --test scripts/*.test.mjs
```

規範改了先改測試再改驗證器，兩邊不能脫鉤。

---

## 目錄結構

```text
Ray-Voice-SKILL/
├── SKILL.md                      # 語氣與思考模式規範本體，AI 讀這份
├── references/
│   └── zh-tw.md                  # 繁中台灣用語與標點的完整對照表
├── assets/
│   └── voice-profile.json        # 驗證器的規則來源，改語氣改這份
└── scripts/
    ├── check-voice.mjs           # 驗證器
    └── check-voice.test.mjs      # 驗證器的測試
```

---

## 更新

裝法一（symlink）：

```bash
git -C ~/GitHub/Ray-Voice-SKILL pull
```

裝法二（直接 clone）：

```bash
git -C ~/.claude/skills/ray-voice pull
git -C ~/.codex/skills/ray-voice pull
```

更新完重開 session 才會吃到新的。

---

## 移除

```bash
rm ~/.claude/skills/ray-voice    # symlink 用 rm
rm ~/.codex/skills/ray-voice

rm -rf ~/.claude/skills/ray-voice    # 直接 clone 進去的用 rm -rf
rm -rf ~/.codex/skills/ray-voice
```

刪之前先 `ls -la` 確認那個是 symlink 還是真的資料夾，別把原始 repo 一起砍掉。

---

## 改成你自己的語氣

這份是照我的講話習慣做的，你要改成你自己的，動兩個地方：

`SKILL.md` 是給 AI 讀的規範，語尾詞、比喻習慣、思考模式、反模式都在裡面，你照自己的講話方式改。

`assets/voice-profile.json` 是驗證器的規則，裡面每一條有 `id`、`severity`、`type` 跟對應的詞表。想加自己的禁用詞就往 `never-phrase` 的 `phrases` 塞，想改慣用寫法就動 `prefer-form` 的 `swaps`。

改完記得跑一次測試，確認驗證器沒被你改壞。

---

## 需要的環境

Claude Code 或 Codex 其中一個，加上 Node 18 以上（只有驗證器需要，光用 skill 不跑驗證器的話 Node 可以不裝）。
