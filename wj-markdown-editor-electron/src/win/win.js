import {fileURLToPath} from "url";
import path from "path";
import {BrowserWindow, screen} from "electron";
import winOnUtil from "../util/winOnUtil.js";
import constant from "../util/constant.js";
import config, {configWatch} from "../local/config.js";

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let win
const execute = func => {
    if(win && !win.isDestroyed()){
        func && func()
    }
}

const obj = {
    get: () => win,
    open: (searchBarWin, common, globalShortcutUtil, globalData) => {
        win = new BrowserWindow({
            frame: false,
            icon: path.resolve(__dirname, '../../icon/favicon.ico'),
            title: constant.title,
            width: config.winWidth > 0 ? config.winWidth : screen.getPrimaryDisplay().workArea.width / 2,
            height: config.winHeight > 0 ? config.winHeight : screen.getPrimaryDisplay().workArea.height / 2,
            show: false,
            maximizable: true,
            resizable: true,
            webPreferences: {
                preload: path.resolve(__dirname, '../preload.js')
            }
        })
        if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev') {
            win.webContents.openDevTools()
        }
        winOnUtil.handle(win, searchBarWin, common, globalShortcutUtil, globalData)
        const index = globalData.fileStateList.length - 1
        if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev') {
            win.loadURL('http://localhost:8080/#/' + (globalData.fileStateList[index].originFilePath ? config.initRoute : constant.router.edit) + '?id=' + globalData.fileStateList[index].id).then(() => {})
        } else {
            win.loadFile(path.resolve(__dirname, '../../web-dist/index.html'), { hash: globalData.fileStateList[index].originFilePath ? config.initRoute : constant.router.edit, search: 'id=' + globalData.fileStateList[index].id }).then(() => {})
        }
    },
    show: () => {
        execute(() => {
            if(win.isMinimized()){
                win.restore()
            } else if (win.isVisible() === false) {
                win.show()
            }
            if(win.isFocused() === false) {
                win.focus()
            }
        })
    },
    close: () => {
        execute(() => {
            win.close()
        })
    },
    changeTab: id => {
        execute(() => {
            win.webContents.send('changeTab', id)
        })
    },
    showMessage: (content, type, duration, destroyBefore) => {
        execute(() => {
            win.webContents.send('showMessage', content, type, duration, destroyBefore)
        })
    },
    shouldUpdateConfig: config => {
        execute(() => {
            win.webContents.send('shouldUpdateConfig', config)
        })
    },
    isFocused: () => {
        return win.isFocused()
    },
    hide: () => {
        execute(() => {
            win.hide()
        })
    },
    minimize: () => {
        execute(() => {
            win.minimize()
        })
    },
    instanceFuncName: funcName => {
        execute(() => {
            win[funcName]()
        })
    },
    findInPage: (searchContent, options) => {
        execute(() => {
            win.webContents.findInPage(searchContent, options)
        })
    },
    stopFindInPage: () => {
        execute(() => {
            win.webContents.stopFindInPage('clearSelection')
        })
    },
    closeMessage: () => {
        execute(() => {
            win.webContents.send('closeMessage')
        })
    },
    insertScreenshotResult: data => {
        execute(() => {
            win.webContents.send('insertScreenshotResult', data)
        })
    },
    openWebdavPath: webdavPath => {
        execute(() => {
            win.webContents.send('openWebdavPath', webdavPath)
        })
    },
    noticeToSave: data => {
        execute(() => {
            win.webContents.send('noticeToSave', data)
        })
    },
    hasNewVersion: () => {
        execute(() => {
            win.webContents.send('hasNewVersion')
        })
    },
    updateFileStateList: list => {
        execute(() => {
            win.webContents.send('updateFileStateList', list)
        })
    },
    loginState: webdavLoginState => {
        execute(() => {
            win.webContents.send('loginState', webdavLoginState)
        })
    },
    toggleView: () => {
        execute(() => {
            win.webContents.send('toggleView')
        })
    }
}

const init = () => {
    configWatch({
        nameList: [],
        handle: config => {
            obj.shouldUpdateConfig(config)
        }
    })
}

init()
export default obj