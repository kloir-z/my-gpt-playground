from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
import openai
import json
import os
import time
import tiktoken
from pathlib import Path
import traceback
import socket
from contextlib import closing

app = Flask(__name__)
socketio = SocketIO(app)
cancel_generation = {}

#ChatGPT関連変数の初期化
openai.api_key=os.environ["OPENAI_API_KEY"]
model="gpt-3.5-turbo-16k-0613"
system_setting = """
AI Assistant
"""
messages=[]
temperature=0.7 #0.00 - 2.00 def 1 What sampling temperature to use, between 0 and 2. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic. We generally recommend altering this or top_p but not both.
top_p=1 #0.00 - 1.00 def 1 An alternative to sampling with temperature, called nucleus sampling, where the model considers the results of the tokens with top_p probability mass. So 0.1 means only the tokens comprising the top 10% probability mass are considered. We generally recommend altering this or temperature but not both.
stream=True #この一連のプログラムはTrueのみに対応。
stop=None
max_tokens=2048
presence_penalty=-0 # -2.00 - 2.00. def 0 Positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics.
frequency_penalty=-0 # -2.00 - 2.00. def 0 Positive values penalize new tokens based on their existing frequency in the text so far, decreasing the model's likelihood to repeat the same line verbatim.


#引数をchat_completion_argsにまとめる
chat_completion_args = {
    'model': model,
    'messages': messages,
    'temperature': temperature,
    'top_p': top_p,
    'stream': stream,
    'stop': stop,
    'max_tokens': max_tokens,
    'presence_penalty': presence_penalty,
    'frequency_penalty': frequency_penalty
}

#ChatGPT messages初期化
def initialize_messages(system_setting):
    if system_setting is not None:
        system_setting = system_setting.strip()
        if not stream:
            system_setting = "【厳守事項】\n    改行する箇所は必ず￥u000a(￥は半角)として返してください。\n【設定事項】\n    " + system_setting #無改行文章対策
        if chat_completion_args['messages'] and chat_completion_args['messages'][0]["role"] == "system":
            chat_completion_args['messages'][0]["content"] = system_setting
        else:
            chat_completion_args['messages'].insert(0, {"role": "system", "content": system_setting})

def num_tokens_from_messages(messages, model=chat_completion_args['model']):
    """Returns the number of tokens used by a list of messages."""
    try:
        encoding = tiktoken.encoding_for_model(model)
    except KeyError:
        print("Warning: model not found. Using cl100k_base encoding.")
        encoding = tiktoken.get_encoding("cl100k_base")
    if model == "gpt-3.5-turbo":
        print("Warning: gpt-3.5-turbo may change over time. Returning num tokens assuming gpt-3.5-turbo-0613.")
        return num_tokens_from_messages(messages, model="gpt-3.5-turbo-0613")
    elif model == "gpt-4":
        print("Warning: gpt-4 may change over time. Returning num tokens assuming gpt-4-0613.")
        return num_tokens_from_messages(messages, model="gpt-4-0613")
    elif model == "gpt-3.5-turbo-0613":
        tokens_per_message = 4  # every message follows <|start|>{role/name}\n{content}<|end|>\n
        tokens_per_name = -1  # if there's a name, the role is omitted
    elif model == "gpt-4-0613":
        tokens_per_message = 3
        tokens_per_name = 1
    else:
        raise NotImplementedError(f"""num_tokens_from_messages() is not implemented for model {model}. See https://github.com/openai/openai-python/blob/main/chatml.md for information on how messages are converted to tokens.""")
    num_tokens = 0
    for message in messages:
        num_tokens += tokens_per_message
        for key, value in message.items():
            num_tokens += len(encoding.encode(value))
            if key == "name":
                num_tokens += tokens_per_name
#   num_tokens += 3  # every reply is primed with <|start|>assistant<|message|>
    return num_tokens

@app.route('/num_tokens', methods=['POST'])
def num_tokens():
    data = request.json
    messages = data.get('messages', [])
    model = data.get('model', chat_completion_args['model'])
    num_tokens = num_tokens_from_messages(messages, model)
    return jsonify({"num_tokens": num_tokens})

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/get-initial-messages')
def get_initial_messages():
    chat_completion_args['messages'] =[]
    initialize_messages(system_setting)
    return jsonify(chat_completion_args['messages'])

@app.route('/save-json', methods=['POST'])
def save_json():
    data = request.json
    filename = data.get('filename', 'messages.json')
    json_data = data.get('messages')
    with open(Path('chat_history') / filename, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, ensure_ascii=False, indent=4)
    return jsonify({'result': 'success'})

def load_json(filename):
    with open(Path('chat_history') / filename, 'r', encoding='utf-8') as f:
        json_data = json.load(f)
    return json_data

@app.route('/load-json')
def get_json_data():
    filename = request.args.get('filename', 'messages.json')
    json_data = load_json(filename)
    chat_completion_args['messages'] = json_data
    return jsonify(json_data)

@app.route('/list-json-files')
def list_json_files():
    json_files = [f for f in os.listdir('chat_history') if f.endswith('.json')]
    return jsonify(json_files)

@app.route('/change_model', methods=['POST'])
def change_model():
    chat_completion_args['model'] = request.form.get('model')
    return chat_completion_args['model']

@socketio.on('cancel_generation')
def handle_cancel_generation():
    session_id = request.sid
    cancel_generation[session_id] = True

@socketio.on('new_messages')
def handle_new_messages(new_messages, requestOptions):
    session_id = request.sid  # クライアントのセッションIDを取得
    cancel_generation[session_id] = False  # そのセッション用のキャンセルフラグをリセット
    chat_completion_args['messages'] = new_messages
    chat_completion_args.update(requestOptions)

    try:
        response = openai.ChatCompletion.create(**chat_completion_args)

        if chat_completion_args['stream']:
            assistant_message = []
            for chunk in response:
                if cancel_generation.get(session_id, False):  # セッションごとのキャンセルフラグをチェック
                    break
                chunk_content = chunk["choices"][0]["delta"].get("content", "")
                emit('message_chunk', chunk_content)
                assistant_message.append(chunk_content)
            emit('message_chunk', "__END_OF_RESPONSE__")
            assistant_message = "".join(assistant_message).strip()
        else:
            assistant_message = response["choices"][0]["message"]["content"].strip()
            assistant_message = assistant_message.replace('\u000a', '\n')
            emit('message', assistant_message)

        chat_completion_args['messages'].append({"role": "assistant", "content": assistant_message})

    finally:
        if session_id in cancel_generation:  # セッションが終了したら、そのキャンセルフラグを削除
            del cancel_generation[session_id]

@socketio.on('ack') #ackを受け取ったら次のチャンクを送るためのものだが、利用しなくても問題なさそうなので利用していない。
def handle_ack():
    socketio.sleep(0)

def run_app_on_available_port(app, default_port=5000, max_attempts=10):
    attempt = 0

    while attempt < max_attempts:
        port = default_port + attempt
        with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
            if sock.connect_ex(('0.0.0.0', port)) != 0:
                print(f"Port {port} is available, starting the app on this port.")
                socketio.run(app, debug=False, host='0.0.0.0', port=port)
                break
            else:
                print(f"Port {port} is in use, trying the next one.")
                attempt += 1

    if attempt == max_attempts:
        print("All attempted ports are in use. Please check and try again.")


if __name__ == '__main__':
    run_app_on_available_port(app)
