const bot = require('./bot.js')
const uploadFileStream = require('./uploadFileStream')
const getUserNameById = require('./getUserNameById')
const saveAudioToFirestore = require('./saveAudioToFirestore')
const saveVideoToFirestore = require('./saveVideoToFirestore')

const conversations = {}

const buildConversation = (conversation = {}) => ({
    step: conversation.step || Steps.initial,
    audio: conversation.audio || null,
    video: conversation.video || null,
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

const buildVideo = ({ videoId, videoUrl, thumbUrl, bitrateBps, duration, fileName, fileSize, description, title, thumbHeight, thumbWidth }) => ({
    id: videoId,
    fileDetails: {
        bitrateBps: bitrateBps || 128,
        url: videoUrl,
        creationTime: Math.round(Date.now() / 1000),
        durationMs: duration ? duration * 1000 : 0,
        fileName: fileName || "",
        fileSize: fileSize || 0,
        url: videoUrl,
    },
    snippet: {
        description: description || "",
        publishedAt: Math.round(Date.now() / 1000),
        tags: ["highvibe"],
        title: title || "",
        videoThumbnail: {
            url: thumbUrl,
            height: thumbHeight || 0,
            width: thumbWidth || 0,
        }
    },
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
    video: /video/,
    confirm: /confirm/,
    cancel: /cancel/,
}

const Steps = {
    initial: "Initial",
    loginChosen: "LoginChosen",
    audioChosen: "AudioChosen",
    videoChosen: "VideoChosen",
    audioReceived: "AudioReceived",
    photoReceived: "PhotoReceived",
    audioProcessing: "AudioProcessing",
    videoProcessing: "VideoProcessing",
    videoReceived: "VideoReceived",
}

const Messages = {
    start: () => "💖 Welcome! Login, then Upload audio files",
    login: () => "🧎 Please send me userId",
    loginDone: ({ userId, userName }) => `🧘 Authorized as ${userName} (${userId}), choose next operation`,
    audio: () => "🎧 Send audio file (MP3)",
    photo: () => "🖼️ Send photo file (JPG)",
    video: () => "Send video file (MP4)",
    confirm: (summary) => `🧾 Confirm? \r\n ${JSON.stringify(summary)}`,
    processing: () => `🕐 Please wait, file processing...`,
    audioDone: () => `✅ Audio uploaded, choose next operation`,
    videoDone: () => `✅ Video uploaded, choose next operation`,
    cancel: () => `❎ Operation Cancelled, choose next operation`,
    failed: () => `❌ Operation Failed, choose next operation`
}

const Callbacks = {
    login: "Login",
    audio: "Audio",
    video: "Video",
    confirm: "Confirm",
    confirmVideo: "ConfirmVideo",
    cancel: "Cancel",
}

const Buttons = {
    login: buildButton('Login', Callbacks.login),
    audio: buildButton('Audio', Callbacks.audio),
    video: buildButton('Video', Callbacks.video),
    confirm: buildButton('Confirm', Callbacks.confirm),
    confirmVideo: buildButton('Confirm', Callbacks.confirmVideo),
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
    video: (chatId) => sendMessage({
        chatId,
        message: Messages.video(),
        buttons: [Buttons.cancel],
        conversation: {
            step: Steps.videoChosen
        }
    }),
    confirmVideo: (chatId) => sendMessage({
        chatId,
        message: Messages.processing(),
        buttons: [Buttons.cancel],
        conversation: {
            step: Steps.videoProcessing,
        }
    }).then(() =>
        saveVideoToFirestore(conversations[chatId].video)
    ).then(() => {
        sendMessage({
            chatId,
            message: Messages.videoDone(),
            buttons: [Buttons.login, Buttons.audio, Buttons.video],
            conversation: {
                step: Steps.initial,
                video: null
            }
        })
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
            buttons: [Buttons.login, Buttons.audio, Buttons.video],
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
            buttons: [Buttons.login, Buttons.audio, Buttons.video],
            conversation: {
                step: Steps.initial,
                audio: null,
                video: null
            }
        })
    }),
    cancel: (chatId) => sendMessage({
        chatId,
        message: Messages.cancel(),
        buttons: [Buttons.login, Buttons.audio, Buttons.video],
        conversation: {
            step: Steps.initial,
            audio: null,
            video: null
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

    bot.onText(Commands.video, function (message) {
        const chatId = message.chat.id

        if (isStep(chatId, Steps.initial))
            Handlers.video(chatId)
    })

    bot.onText(Commands.confirmVideo, function (message) {
        const chatId = message.chat.id

        if (isStep(chatId, Steps.videoReceived))
            Handlers.confirmVideo(chatId)
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
                buttons: [Buttons.login, Buttons.audio, Buttons.video],
                conversation: {
                    step: Steps.initial,
                    user: user,
                }
            })
        }).catch(err => {
            sendMessage({
                chatId,
                message: Messages.failed(),
                buttons: [Buttons.login, Buttons.audio, Buttons.video],
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

    bot.on('video', message => {
        const chatId = message.chat.id

        if (!isStep(chatId, Steps.videoChosen)) return

        const videoId = message.video.file_id
        const thumbId = message.video.thumb.file_id
        const thumbWidth = message.video.thumb.width
        const thumbHeight = message.video.thumb.height
        const duration = message.video.duration

        sendMessage({
            chatId,
            message: Messages.processing(),
            buttons: [Buttons.cancel],
        }).then(() => {
            const videoPath = `video/${videoId}.mp4`
            const thumbPath = `videothumb/${videoId}.jpg`

            const videoStream = bot.getFileStream(videoId)
            const thumbStream = bot.getFileStream(thumbId)

            return Promise.all([
                uploadFileStream({
                    fileStream: videoStream,
                    filePath: videoPath
                }),
                uploadFileStream({
                    fileStream: thumbStream,
                    filePath: thumbPath,
                }),
            ])
        }).then(result => {
            const [videoUrl, thumbUrl] = result

            console.log({ videoUrl, thumbUrl })

            const video = buildVideo({
                videoId,
                videoUrl,
                thumbUrl,
                duration,
                thumbHeight,
                thumbWidth,
            })

            return sendMessage({
                chatId,
                message: Messages.confirm(video),
                buttons: [Buttons.cancel, Buttons.videoConfirm],
                conversation: {
                    step: Steps.videoReceived,
                    video: video,
                }
            })
        }).catch(err => {
            console.error(`Cannot upload video ${videoId} because of ${err.toString()}`)
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
        } else if (callback == Callbacks.video) {
            Handlers.video(chatId)
        } else if (callback == Callbacks.videoConfirm) {
            Handlers.videoConfirm(chatId)
        }
    })

    bot.on('polling_error', err => console.error(err))
}

main()