const socket = io();
let messages = [];
let currentItem = null;
let saveToLocalStorageTimer = null;
let generatingResponse = false;

$(document).ready(() => {
    function loadMessages(selectedFile = null) {
        let url = selectedFile ? '/load-json' : '/get-initial-messages';
        let data = selectedFile ? { filename: selectedFile } : {};

        $.ajax({
            url: url,
            type: 'GET',
            dataType: 'json',
            data: data,
            success: function (response) {
                messages = response;
                displayMessages();
                saveToLocalStorage();
            },
            error: function () {
                alert('エラーが発生しました。');
            }
        });
    }

    function listJsonFiles() {
        return new Promise((resolve, reject) => {
            $.ajax({
                url: '/list-json-files',
                type: 'GET',
                dataType: 'json',
                success: function (response) {
                    response.forEach(file => {
                        $('#json-files').append(`<option value="${file}">${file}</option>`);
                    });
                    resolve();
                },
                error: function () {
                    alert('エラーが発生しました。');
                    reject();
                }
            });
        });
    }

    function saveToLocalStorage(refresh = false) {
        const userSettings = {
            messages: messages,
            role: $('#role').val(),
            inputContent: $('#content').val(),
            selectedJsonFile: $('#json-files').val(),
            selectedModel: $('#model-select').val()
        };
        localStorage.setItem('userSettings', JSON.stringify(userSettings));
        if (refresh) {
            location.reload();
        }
    }

    function loadFromLocalStorage() {
        const savedUserSettings = localStorage.getItem('userSettings');
        if (savedUserSettings) {
            const userSettings = JSON.parse(savedUserSettings);
            messages = userSettings.messages;
            $('#role').val(userSettings.role);
            $('#json-files').val(userSettings.selectedJsonFile);
            $('#model-select').val(userSettings.selectedModel);
            displayMessages();
            $('#content').val(userSettings.inputContent);
            changeModel(userSettings.selectedModel);
        } else {
            loadMessages();
        }
    }

    function autoResizeTextarea() {
        $(document).on('input', 'textarea', function () {
            const prevChatContainerScrollTop = $('#chat-container')[0].scrollTop; //入力時発生するリサイズにカーソル位置が画面最下部に自動スクロールされるのを抑止するため対象の現在のスクロール位置を取得
            const prevBodyScrollTop = window.pageYOffset; //上に同じ
            const prevChatContainerScrollHeight = $('#chat-container')[0].scrollHeight;
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
            $('#chat-container')[0].scrollTop = prevChatContainerScrollTop; //カーソル位置を戻す
            window.scrollTo(0, prevBodyScrollTop); //上に同じ
        });
    }

    function enableSortable() {
        if (generatingResponse) {
            toggleSendButton();
            console.log("91");
        }
        $('#chat-container').sortable({
            items: '.message-box',
            handle: '.drag-handle',
            update: function () {
                const sortedMessages = $(this).sortable('toArray', { attribute: 'data-index' }).map(index => messages[index]);
                messages = sortedMessages;
                saveToLocalStorage();
                displayMessages();
            }
        });
    }

    function changeModel(modelName) {
        $.ajax({
            url: "/change_model",
            method: "POST",
            data: { model: modelName },
            success: function (response) {
                console.log("Model changed:", response);
            },
            error: function (error) {
                console.error("Error changing model:", error);
            }
        });
    }

    function displayMessages(createNewAiBox = false) {
        $('#chat-container').empty();

        messages.forEach((message, index) => {
            let msgClass = '';
            if (message.role === 'user') {
                msgClass = 'user';
            } else if (message.role === 'assistant') {
                msgClass = 'assistant';
            } else if (message.role === 'system') {
                msgClass = 'system';
            }
            let escapedContent = $('<div>').text(message.content).html(); // コンテンツをエスケープ
            let messageBox = $(`<div class="message-box" data-index="${index}"><textarea class="${msgClass}" rows="1" readonly>${escapedContent}</textarea><div class="message-box-options"><div class="move_delete"><span class="drag-handle">&#x2630;</span><button class="delete-button">×</button></div><label class="token-label">0</label></div></div>`);
            messageBox.attr('data-index', index);
            $('#chat-container').append(messageBox);
        });

        $('#chat-container textarea').dblclick(function () {
            if (generatingResponse) {
                toggleSendButton();
                console.log("140");
            }
            if (!$(this).attr('readonly'))
                return;
            $(this).removeAttr('readonly');
            $(this).addClass('editing');
        });

        $('#chat-container textarea').each(function () {
            if (generatingResponse) {
                toggleSendButton();
                console.log(" ");
            }
            $(this).trigger('input');
        });

        if (createNewAiBox) {
            let newIndex = messages.length;
            $('#chat-container').append(`<div class="message-box" data-index="${newIndex}"><textarea class="assistant" rows="1"></textarea><div class="message-box-options"><div class="move_delete"><span class="drag-handle">&#x2630;</span><button class="delete-button">×</button></div><label class="token-label">0</label></div></div>`);
        }

        $('#chat-container').scrollTop($('#chat-container')[0].scrollHeight);
        updateMessageToken();
        updateTokenSum();
    }

    function updateMessageToken(messageIndex = null) {
        const model = $('#model-select').val();
        const messageBoxes = $('#chat-container .message-box');
        const start = messageIndex !== null ? messageIndex : 0;
        const end = messageIndex !== null ? messageIndex + 1 : messageBoxes.length;
    
        for (let i = start; i < end; i++) {
            const messageBox = messageBoxes.eq(i);
            const content = messageBox.find('textarea').val();
            const message = messages[i];
            if (message) {
                const role = message.role;
                $.ajax({
                    url: '/num_tokens',
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({ messages: [{ role: role, content: content }], model: model }),
                    success: (function (index, role) {
                        return function (response) {
                            let num_tokens = response.num_tokens;
                            if (role === 'assistant') {
                                num_tokens -= 4;
                            }
                            const tokenLabel = messageBox.find('.token-label');
                            tokenLabel.text(num_tokens);
                        };
                    })(i, role),
                    error: function () {
                        console.error('Error getting token count for message.');
                    }
                });
            }
        }
    }
    
    function updateTokenSum() {
        const model = $('#model-select').val();
        const content = $('#content').val();
        const roleOption = $('#role').val();
        let role;
        if (roleOption === 'User' || roleOption === 'User(add only)') {
            role = 'user';
        } else if (roleOption === 'AI') {
            role = 'assistant';
        } else if (roleOption === 'System') {
            role = 'system';
        }

        if (content === '') {
            updateTotalTokensLabel(0, model);
        } else {
            $.ajax({
                url: '/num_tokens',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ messages: [{ role: role, content: content }], model: model }),
                success: function (response) {
                    const content_tokens = response.num_tokens + 4;
                    updateTotalTokensLabel(content_tokens, model);
                },
                error: function () {
                    console.error('Error getting content token count.');
                }
            });
        }

        function updateTotalTokensLabel(content_tokens, model) {
            const modelsMaxTokens = {
                "gpt-3.5-turbo": 4096,
                "gpt-4": 8192
            };
            const modelMaxTokens = modelsMaxTokens[model];

            $.ajax({
                url: '/num_tokens',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ messages: messages, model: model }),
                success: function (response) {
                    const num_tokens = response.num_tokens;
                    const tokens_in_messages = num_tokens;
                    const max_tokens = parseInt($('#max_tokens-value').val());
                    const inputtableTokens = modelMaxTokens - tokens_in_messages - content_tokens - max_tokens;
                    const total_tokens = tokens_in_messages + content_tokens;
                    const inputtableTokensStyle = inputtableTokens < 0 ? 'style="color: red;"' : '';
                    $('#total-tokens-label').html(`total tokens: ${tokens_in_messages} + ${content_tokens} = ${total_tokens},    inputtable tokens: ${modelMaxTokens} - ${total_tokens} - ${max_tokens} = <span ${inputtableTokensStyle}>${inputtableTokens}</span>`);
                },
                error: function () {
                    console.error('Error getting token sum.');
                }
            });
        }
    }

    $(window).on('resize', function () {
        $('#chat-container textarea').each(function () {
            $(this).trigger('input');
        });
    });

    $('#chat-container').on('blur', 'textarea.editing', function () {
        const index = $(this).parent().data('index');
        const newContent = $(this).val();
        if (generatingResponse) {
            toggleSendButton();
            console.log(" ");
        }
        messages[index].content = newContent;
        $(this).removeClass('editing');
        $(this).attr('readonly', 'readonly');
        saveToLocalStorage();
        updateMessageToken();
        updateTokenSum();
    });

    $('#chat-container').on('click', '.delete-button', function () {
        const index = $(this).closest('.message-box').data('index');
        if (generatingResponse) {
            toggleSendButton();
            console.log(" ");
        }
        messages.splice(index, 1);
        displayMessages();
        saveToLocalStorage();
    });

    $('#role').change(function () {
        saveToLocalStorage();
        updateTokenSum();
    });

    $('#content').on('focus', function () {
        if (saveToLocalStorageTimer === null) {
            saveToLocalStorageTimer = setInterval(() => {
                saveToLocalStorage();
            }, 1000);
        }
    });

    $('#content').on('blur', function () {
        if (saveToLocalStorageTimer !== null) {
            clearInterval(saveToLocalStorageTimer);
            saveToLocalStorageTimer = null;
        }
        saveToLocalStorage();
        updateTokenSum();
    });

    let prevContentHeight = $('#content')[0].scrollHeight;
    $('#content').on('input', function () {
        const currentContentHeight = $(this)[0].scrollHeight;
        const windowHeight = window.innerHeight;
        const bodyHeight = document.body.scrollHeight;
        const scrollPosition = window.pageYOffset;

        const isContentHeightChanged = prevContentHeight !== currentContentHeight;
        const isNearBottom = (bodyHeight - scrollPosition - windowHeight) <= 50; // 50px の範囲内であれば下部とみなす

        if (isContentHeightChanged && isNearBottom) {
            setTimeout(() => {
                window.scrollTo(0, document.body.scrollHeight);
            }, 30); //テキストエリアが広がった後にtriggerさせる想定
        }
        prevContentHeight = currentContentHeight;
    });

    $('#json-files').change(function () {
        const selectedFile = $(this).val();
        if (generatingResponse) {
            toggleSendButton();
            console.log(" ");
        }
        loadMessages(selectedFile);
    });

    function toggleSendButton() {
        if (generatingResponse) {
            $('#send').text('⏎');
            socket.emit('cancel_generation');
            generatingResponse = false;
        } else {
            $('#send').text('■');
            generatingResponse = true;
        }
    }

    $('#send').on('click', function (e) {
        e.preventDefault();
        if (generatingResponse) {
            toggleSendButton();
            console.log(" ");
            return;
        }
        let role = $('#role').val();
        let content = $('#content').val();

        function sendMessage() {
            let emitMessage = true;
            if (role === 'user(add only)') {
                role = 'user';
                emitMessage = false;
            }
            messages.push({ "role": role, "content": content });
            console.log('New messages:', messages);
            if (role === 'user' && emitMessage) {
                displayMessages(true);
                const requestOptions = {
                    temperature: parseFloat($('#temperature-slider').val()),
                    top_p: parseFloat($('#top_p-slider').val()),
                    max_tokens: parseInt($('#max_tokens-slider').val()),
                    presence_penalty: parseFloat($('#presence_penalty-slider').val()),
                    frequency_penalty: parseFloat($('#frequency_penalty-slider').val()),
                };
                socket.emit('new_messages', messages, requestOptions);
                toggleSendButton();
                console.log("send");
            } else {
                displayMessages();
            }
            $('#content').val('');
            $('textarea#content').trigger('input', () => {
                updateTokenSum();
            });
            saveToLocalStorage();
            updateTokenSum();
            $('#content').focus();
        }

        if (content) {
            sendMessage();
        } else {
            if (confirm('現状のメッセージを送信しますか？')) {
                displayMessages(true);
                const requestOptions = {
                    temperature: parseFloat($('#temperature-slider').val()),
                    top_p: parseFloat($('#top_p-slider').val()),
                    max_tokens: parseInt($('#max_tokens-slider').val()),
                    presence_penalty: parseFloat($('#presence_penalty-slider').val()),
                    frequency_penalty: parseFloat($('#frequency_penalty-slider').val()),
                };
                socket.emit('new_messages', messages, requestOptions);
                toggleSendButton();
                $('#content').val('');
                $('textarea#content').trigger('input', () => {
                    updateTokenSum();
                });
                saveToLocalStorage();
                updateTokenSum();
            }
        }
    });

    socket.on('message_chunk', (chunk) => {
        if (!currentItem) {
            currentItem = $('#chat-container .message-box:last textarea');
            messages.push({ "role": "assistant", "content": "" }); // 新規メッセージを追加
        } else if (chunk === "__END_OF_RESPONSE__") {
            currentItem = null;
            displayMessages();
            saveToLocalStorage();
            if (generatingResponse) {
                toggleSendButton();
                console.log(" ");
            }
        } else {
            updateMessageToken(messages.length - 1);
            updateTokenSum();
            currentItem.val((i, oldVal) => {
                const newVal = oldVal + chunk;
                messages[messages.length - 1].content = newVal; // messagesの最後の要素のcontentを更新
                return newVal;
            });
            /*           socket.emit('ack');*/
            currentItem.trigger('input');
            const chatContainer = $('#chat-container');
            const scrollDifference = chatContainer[0].scrollHeight - chatContainer[0].scrollTop - chatContainer.innerHeight();
            const scrollThreshold = 50; // 任意の閾値を設定（ここでは50pxとしています）
            if (scrollDifference <= scrollThreshold) {
                $('#chat-container').scrollTop($('#chat-container')[0].scrollHeight);
            }
        }
    });

    $('#new').on('click', function () {
        messages = [];
        loadMessages();
        saveToLocalStorage();
        $('#json-files').val('');
        if (generatingResponse) {
            toggleSendButton();
            console.log(" ");
        }
    });

    $('#save').on('click', function () {
        event.preventDefault();
        const selectedFile = $('#json-files').val();
        if (!selectedFile) {
            $('#save-as').click(); // If no filename is selected, trigger "Save As" behavior
            return;
        }
        $.ajax({
            url: '/save-json',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                'messages': messages,
                'filename': selectedFile
            }),
            success: function (response) {
                if (response.result === 'success') {
                    alert('JSONデータが正常に保存されました。');
                } else {
                    alert('エラーが発生しました。');
                }
            },
            error: function () {
                alert('エラーが発生しました。');
            }
        });
        return false;
    });

    $('#save-as').on('click', function () {
        event.preventDefault();
        let newFilename = prompt('新しいファイル名を入力してください:');
        if (newFilename) {
            if (!newFilename.endsWith('.json')) {
                newFilename += '.json';
            }
            $.ajax({
                url: '/save-json',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    'messages': messages,
                    'filename': newFilename
                }),
                success: function (response) {
                    if (response.result === 'success') {
                        alert('JSONデータが正常に保存されました。');
                        $('#json-files').append(`<option value="${newFilename}">${newFilename}</option>`);
                        $('#json-files').val(newFilename);
                    } else {
                        alert('エラーが発生しました。');
                    }
                },
                error: function () {
                    alert('エラーが発生しました。');
                }
            });
            return false;
        }
    });

    $('#model-select').on('change', function () {
        const selectedModel = $(this).val();
        changeModel(selectedModel);
        saveToLocalStorage();
        updateMessageToken();
        updateTokenSum();
    });

    $('#content').on('input', () => {
        updateTokenSum();
    });

    $('#role').on('change', () => {
        updateTokenSum();
    });

    // フロートパネルの表示/非表示の切り替え
    $('#model-select-label').on('click', function (e) {
        e.stopPropagation(); // model-select クリックイベントの伝播を停止
        $('#settings-panel').toggle();
        updateTokenSum();
    });

    $(document).on('click', function () {
        var panel = $('#settings-panel');
        if(panel.is(':visible')) { // パネルが表示されているかどうかを確認
            panel.hide(); // パネルを非表示にする
            updateTokenSum(); // 非表示にした後で updateTokenSum を呼び出す
        }
    });    

    $('#settings-panel').on('click', function (e) {
        e.stopPropagation(); // settings-panel クリックイベントの伝播を停止
    });

    $('input[type="range"]').each(function () {
        const sliderId = $(this).attr('id');
        const sliderValue = $(this).val();
        $('#' + sliderId + '-value').text(sliderValue);
        updateTokenSum();
    });

    // Update slider value labels
    $("#temperature-slider").on("input", function () {
        $("#temperature-value").text($(this).val());
    });

    $("#top_p-slider").on("input", function () {
        $("#top_p-value").text($(this).val());
    });

    $("#max_tokens-slider").on("input", function () {
        $("#max_tokens-value").text($(this).val());
    });

    $("#presence_penalty-slider").on("input", function () {
        $("#presence_penalty-value").text($(this).val());
    });

    $("#frequency_penalty-slider").on("input", function () {
        $("#frequency_penalty-value").text($(this).val());
    });

    function syncSliderAndInput(sliderId, inputId) {
        $(`#${sliderId}`).on('input', function () {
            $(`#${inputId}`).val($(this).val());
            updateChatCompletionArgs();
            updateTokenSum();
        });

        $(`#${inputId}`).on('input', function () {
            $(`#${sliderId}`).val($(this).val());
            updateChatCompletionArgs();
            updateTokenSum();
        });
    }

    syncSliderAndInput('temperature-slider', 'temperature-value');
    syncSliderAndInput('top_p-slider', 'top_p-value');
    syncSliderAndInput('max_tokens-slider', 'max_tokens-value');
    syncSliderAndInput('presence_penalty-slider', 'presence_penalty-value');
    syncSliderAndInput('frequency_penalty-slider', 'frequency_penalty-value');

    function resetSliderToDefault(sliderId, inputId, defaultValue) {
        $(`label[for="${inputId}"]`).on('click', function () {
            $(`#${sliderId}`).val(defaultValue);
            $(`#${inputId}`).val(defaultValue);
            updateChatCompletionArgs();
        });
    }

    resetSliderToDefault('temperature-slider', 'temperature-value', 0.7);
    resetSliderToDefault('top_p-slider', 'top_p-value', 1);
    resetSliderToDefault('max_tokens-slider', 'max_tokens-value', 512);
    resetSliderToDefault('presence_penalty-slider', 'presence_penalty-value', 0);
    resetSliderToDefault('frequency_penalty-slider', 'frequency_penalty-value', 0);

    autoResizeTextarea();
    enableSortable();
    displayMessages();
    listJsonFiles().then(() => {
        loadFromLocalStorage();
    });

    socket.on('error_message', (error) => {
        // エラーメッセージを表示するための処理をここに追加
        console.error('Server error:', error);
        // 例: アラートでエラーを表示
        alert('Server error: ' + error);
    });

    setTimeout(() => {
        $('textarea').trigger('input');
    }, 100); //waitをかけて、読み込み後にtriggerさせる
});
