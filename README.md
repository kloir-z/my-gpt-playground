# my-gpt-playground

## 概要
OpenAIのPlayground(Chat)に少し機能を追加したようなツールです(自由な保存/読込、参考トークン数表示)。  
PythonもJavascriptも初めて触る素人が、GPT-4に聞きながら作成しました。  
スパゲッティコードな気がしていますが関数はきちんと分け、関数名/変数名も分かりやすいので、分割しなくても読みやすいのでは、と思っています。  
※GitHubへのアップロードも、Gitの理解を兼ねて行っています。
<img src="my-gpt-playground.gif" width="852">
## 主な機能

- gpt-3.5-turbo、gpt-4とのチャット
- chat modelのパラメータ調整（temperture、top_p、max_tokens、presence_penalty、frequency_penalty）
- メッセージ毎のトークン、合計トークン、入力可能トークン数の表示(完全に正確な値ではありません)
- 入力可能トークン数を超えると、赤字で警告
- 全メッセージの編集と削除、ドラッグ＆ドロップによる並べ替え
- 長文が貼り付けやすい入力エリア
- チャット履歴の保存/読込(サーバローカルの./chat_historyディレクトリ内のみ利用)

## 前提
- python 3.11で動作を確認しています。
- ローカルでサーバを起動し、自分一人だけが利用する前提のツールです。複数人での利用は試していません。
- ブラウザのローカルストレージに画面の状態を勝手に保存します。
- OpenAIアカウントを取得し、環境変数にOpenAI API キーの追加が必要です。
- GPT-4を使う場合は権限が必要です。

## インストール

1. リポジトリのクローン

```
git clone https://github.com/your-repo/my-gpt-playground.git
```

2. 依存パッケージのインストール

```
pip install -r requirements.txt
```

3. app.pyを実行  

```
python ./app.py
```

4. ブラウザで `http://localhost:5000` を開いてください。  
  
## ライセンス

このプロジェクトはMITライセンスの下でライセンスされています。詳細は [LICENSE](LICENSE) ファイルを参照してください。
