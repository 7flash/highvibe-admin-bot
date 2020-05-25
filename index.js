const bot = require('./bot.js')
const uploadFileStream = require('./uploadFileStream')
const getUserNameById = require('./getUserNameById')
const saveAudioToFirestore = require('./saveAudioToFirestore')

const conversations = {}

const buildConversation = (conversation = {}) => ({
    step: conversation.step || Steps.initial,
    audio: conversation.audio || null,
    user: conversation.user || null,
    removableMessageId: conversation.removableMessageId || null
})

const buildAudio = ({ id, userId, userName, title, subTitle, author, artworkUrlPath, audioUrlPath, duration, tagIds }) => ({
    id: id || audioUrlPath,
    userId: userId,
    userName: userName,
    title: title || "",
    subTitle: subTitle || "",
    author: author || "",
    artworkUrlPath: artworkUrlPath || "",
    audioUrlPath: audioUrlPath || "",
    duration: duration || 0,
    tagIds: tagIds || ["highvibe"]
})

const buildUser = ({ userName = '', userId = '' }) => ({ userName, userId })

const buildButton = (title, callback) => ({
    text: title,
    callback_data: callback
})

const buildKeyboard = (buttons) => ({
    reply_markup: {
        inline_keyboard: [buttons]
    }
})

const Commands = {
    start: /start/,
    login: /login/,
    audio: /audio/,
    confirm: /confirm/,
    cancel: /cancel/,
}

const Steps = {
    initial: "Initial",
    loginChosen: "LoginChosen",
    audioChosen: "AudioChosen",
    audioReceived: "AudioReceived",
    photoReceived: "PhotoReceived",
    audioProcessing: "AudioProcessing",
}

const Messages = {
    start: () => "💖 Welcome! Login, then Upload audio files",
    login: () => "🧎 Please send me userId",
    loginDone: ({ userId, userName }) => `🧘 Authorized as ${userName} (${userId}), choose next operation`,
    audio: () => "🎧 Send audio file (MP3)",
    photo: () => "🖼️ Send photo file (JPG)",
    confirm: (summary) => `🧾 Confirm? \r\n ${JSON.stringify(summary)}`,
    processing: () => `🕐 Please wait, file processing...`,
    audioDone: () => `✅ Operation Succeed, choose next operation`,
    cancel: () => `❎ Operation Cancelled, choose next operation`,
    failed: () => `❌ Operation Failed, choose next operation`
}

const Callbacks = {
    login: "Login",
    audio: "Audio",
    confirm: "Confirm",
    cancel: "Cancel",
}

const Buttons = {
    login: buildButton('Login', Callbacks.login),
    audio: buildButton('Audio', Callbacks.audio),
    confirm: buildButton('Confirm', Callbacks.confirm),
    cancel: buildButton('Cancel', Callbacks.cancel),
}

const Handlers = {
    login: (chatId) => sendMessage({
        chatId,
        message: Messages.login(),
        buttons: [Buttons.cancel],
        conversation: {
            step: Steps.loginChosen,
        }
    }),
    audio: (chatId) => sendMessage({
        chatId,
        message: Messages.audio(),
        buttons: [Buttons.cancel],
        conversation: {
            step: Steps.audioChosen
        }
    }),
    confirm: (chatId) => sendMessage({
        chatId,
        message: Messages.processing(),
        buttons: [Buttons.cancel],
        conversation: {
            step: Steps.audioProcessing,
        }
    }).then(() =>
        saveAudioToFirestore(conversations[chatId].audio)
    ).then(() =>
        sendMessage({
            chatId,
            message: Messages.audioDone(),
            buttons: [Buttons.login, Buttons.audio],
            conversation: {
                step: Steps.initial,
                audio: null
            }
        })
    ).catch(err => {
        console.error(err)

        bot.sendMessage({
            chatId,
            message: Messages.failed(),
            buttons: [Buttons.login, Buttons.audio],
            conversation: {
                step: Steps.initial,
                audio: null
            }
        })
    }),
    cancel: (chatId) => sendMessage({
        chatId,
        message: Messages.cancel(),
        buttons: [Buttons.login, Buttons.audio],
        conversation: {
            step: Steps.initial,
            audio: null
        }
    }),
}

const cleanRemovableMessage = (chatId) => {
    if (conversations[chatId] && conversations[chatId].removableMessageId)
        bot.deleteMessage(chatId, conversations[chatId].removableMessageId)
}

const sendMessage = ({ chatId, message, buttons, conversation }) => {
    return bot.sendMessage(chatId, message, buildKeyboard(buttons)).then(message => {
        cleanRemovableMessage(chatId)

        conversations[chatId] = buildConversation({
            ...conversations[chatId],
            ...conversation,
            removableMessageId: message.message_id
        })
    })
}

const isStep = (chatId, step) => conversations[chatId] != null && conversations[chatId].step == step

async function main() {
    bot.onText(Commands.start, function (message) {
        const chatId = message.chat.id

        if (conversations[chatId] != null) return;

        sendMessage({
            chatId,
            message: Messages.start(),
            buttons: [Buttons.login]
        })
    })

    bot.onText(Commands.login, function (message) {
        const chatId = message.chat.id

        if (isStep(chatId, Steps.initial))
            Handlers.login(chatId)
    })

    bot.onText(Commands.audio, function (message) {
        const chatId = message.chat.id

        if (isStep(chatId, Steps.initial))
            Handlers.audio(chatId)
    })

    bot.onText(Commands.confirm, function (message) {
        const chatId = message.chat.id

        if (isStep(chatId, Steps.photoReceived))
            Handlers.confirm(chatId)
    })

    bot.onText(Commands.cancel, function (message) {
        const chatId = message.chat.id

        if (isStep(chatId, Steps.initial))
            Handlers.cancel(chatId)
    })

    bot.on('message', function (message) {
        const chatId = message.chat.id

        if (!isStep(chatId, Steps.loginChosen)) return

        const userId = message.text

        getUserNameById(userId).then(userName => {
            const user = buildUser({
                userId: userId,
                userName: userName
            })

            return sendMessage({
                chatId,
                message: Messages.loginDone(user),
                buttons: [Buttons.login, Buttons.audio],
                conversation: {
                    step: Steps.initial,
                    user: user,
                }
            })
        }).catch(err => {
            sendMessage({
                chatId,
                message: Messages.failed(),
                buttons: [Buttons.login, Buttons.audio],
                conversation: {
                    step: Steps.initial,
                    user: null
                }
            })
        })
    })

    bot.on('audio', message => {
        const chatId = message.chat.id

        if (!isStep(chatId, Steps.audioChosen)) return

        const audio = message.audio
        const fileId = audio.file_id

        const user = conversations[chatId].user

        sendMessage({
            chatId,
            message: Messages.processing(),
            buttons: [Buttons.cancel],
        }).then(() => {
            const filePath = `audio/${fileId}.mp3`

            const fileStream = bot.getFileStream(fileId)

            return uploadFileStream({ fileStream, filePath })
        }).then(audioUrl => {
            return sendMessage({
                chatId,
                message: Messages.photo(),
                buttons: [Buttons.cancel],
                conversation: {
                    step: Steps.audioReceived,
                    audio: buildAudio({
                        id: fileId,
                        userId: user.userId,
                        userName: user.userName,
                        title: audio.title,
                        author: audio.performer,
                        audioUrlPath: audioUrl,
                        duration: audio.duration,
                    })
                }
            })
        }).catch(err => {
            console.error(`Cannot upload audio by ${user.userName} because of: ${err.toString()}`)

            sendMessage({
                chatId,
                message: Messages.failed(),
                buttons: [Buttons.login, Buttons.audio],
                conversation: {
                    step: Steps.initial,
                }
            })
        })
    })

    bot.on('photo', message => {
        const chatId = message.chat.id

        if (!isStep(chatId, Steps.audioReceived)) return

        const photo = message.photo[message.photo.length - 1]
        const fileId = photo.file_id

        console.log({ photo }) // figure out file format and save with according extension

        const fileStream = bot.getFileStream(fileId)

        const filePath = `photo/${fileId}.jpg`

        sendMessage({
            chatId,
            message: Messages.processing(),
            buttons: [Buttons.cancel],
        }).then(() =>
            uploadFileStream({ fileStream, filePath })
        ).then(photoUrl => {
            console.log({ photoUrl })
            
            const audio = buildAudio({
                ...conversations[chatId].audio,
                artworkUrlPath: photoUrl
            })

            return sendMessage({
                chatId,
                message: Messages.confirm(audio),
                buttons: [Buttons.cancel, Buttons.confirm],
                conversation: {
                    step: Steps.photoReceived,
                    audio: audio
                }
            })
        }).catch(err => {
            console.error(`Cannot upload audio ${filePath} because of ${err.toString()}`)
        })
    })

    bot.on('callback_query', callbackQuery => {
        const callback = callbackQuery.data
        const chatId = callbackQuery.message.chat.id

        bot.answerCallbackQuery(callbackQuery.id, { text: "Done" })

        if (callback == Callbacks.login) {
            Handlers.login(chatId)
        } else if (callback == Callbacks.audio) {
            Handlers.audio(chatId)
        } else if (callback == Callbacks.cancel) {
            Handlers.cancel(chatId)
        } else if (callback == Callbacks.confirm) {
            Handlers.confirm(chatId)
        }
    })

    bot.on('polling_error', err => console.error(err))
}

main()