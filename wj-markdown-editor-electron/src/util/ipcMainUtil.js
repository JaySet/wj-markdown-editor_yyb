import {shell} from 'electron'
import {ipcMain, dialog} from 'electron'
import fs from 'fs'
import globalData from './globalData.js'
import common from './common.js'
import path from 'path'
import pathUtil from './pathUtil.js'
import fsUtil from './fsUtil.js'
import axios from 'axios'
import mime from 'mime-types'
import defaultConfig from './defaultConfig.js'
import webdavUtil from "./webdavUtil.js";
import screenshotsUtil from "./screenshotsUtil.js";
import globalShortcutUtil from "./globalShortcutUtil.js";
import idUtil from "./idUtil.js";
import exportWin from "../win/exportWin.js";
import settingWin from "../win/settingWin.js";
import aboutWin from "../win/aboutWin.js";
import searchBarWin from "../win/searchBarWin.js";
import win from "../win/win.js";

const isBase64Img = files => {
    return files.find(item => item.base64) !== undefined
}

const uploadImage = async obj => {
    const files = obj.fileList
    const fileState = globalData.fileStateList.find(item => item.id === obj.id)
    let list
    win.showMessage('图片处理中', 'loading', 0)
    const insertImgType = common.getImgInsertType(files[0])
    if(insertImgType === '1'){ // 无操作
        if(isBase64Img(files)){
            win.showMessage('无法在当前图片模式下粘贴网络图片或截图', 'error', 2, true)
            return undefined
        } else {
            list = files.map(file => file.path || file.url)
        }
    } else if (insertImgType === '2' || insertImgType === '3' || insertImgType === '4') { // // 2: 复制到 ./%{filename} 文件夹 3: 复制到 ./assets 文件夹 4:复制到指定文件夹
        if((insertImgType === '2' || insertImgType === '3') && !fileState.originFilePath){
            win.showMessage('当前文件未保存，不能将图片保存到相对位置', 'error', 2, true)
            return undefined
        }
        let savePath
        try {
            savePath = common.getImgParentPath(fileState, insertImgType)
        } catch (e) {
            win.showMessage('图片保存路径创建失败,请检查相关设置是否正确', 'error', 2, true)
            return undefined
        }
        list = await Promise.all(files.map(async file => {
            if(file.path){
                const newFilePath = path.join(savePath, idUtil.createId() + '.' + mime.extension(file.type));
                if(fileState.type === 'local' || insertImgType === '4'){
                    fs.copyFileSync(file.path, newFilePath)
                } else {
                    const flag = await webdavUtil.putFileContents(newFilePath, fs.readFileSync(file.path))
                    if(!flag){
                        return undefined
                    }
                }
                if(insertImgType === '2' || insertImgType === '3'){
                    return path.relative(path.join(savePath, '../'), newFilePath)
                }
                return newFilePath
            } else if(file.base64){
                const newFilePath = path.join(savePath, idUtil.createId() + '.' + mime.extension(file.type));
                const buffer = new Buffer.from(file.base64, 'base64');
                if(fileState.type === 'local' || insertImgType === '4'){
                    fs.writeFileSync(newFilePath,  buffer)
                } else {
                    const flag = await webdavUtil.putFileContents(newFilePath, buffer)
                    if(!flag){
                        return undefined
                    }
                }
                if(insertImgType === '2' || insertImgType === '3'){
                    return path.relative(path.join(savePath, '../'), newFilePath)
                }
                return newFilePath
            } else if(file.url) {
                try{
                    const result = await axios.get(file.url, {
                        responseType: 'arraybuffer', // 特别注意，需要加上此参数
                    });
                    const newFilePath = path.join(savePath, idUtil.createId() + '.' + mime.extension(result.headers.get("Content-Type")));
                    if(fileState.type === 'local' || insertImgType === '4'){
                        fs.writeFileSync(newFilePath,  result.data)
                    } else {
                        const flag = await webdavUtil.putFileContents(newFilePath, result.data)
                        if(!flag){
                            return undefined
                        }
                    }
                    if(insertImgType === '2' || insertImgType === '3'){
                        return path.relative(path.join(savePath, '../'), newFilePath)
                    }
                    return newFilePath
                } catch (e) {
                    win.showMessage('图片下载失败', 'error', 2, true)
                    return undefined
                }
            }
        }))
    } else if (insertImgType === '5') { // 上传
        if(!globalData.config.picGo.host || !globalData.config.picGo.port) {
            win.showMessage('请配置PicGo服务信息', 'error', 2, true)
            return undefined
        }
        const tempPath = pathUtil.getTempPath()
        let tempList = await Promise.all(files.map(async file => {
            if(file.path){
                const newFilePath = path.resolve(tempPath, idUtil.createId() + '.' + mime.extension(file.type));
                fs.copyFileSync(file.path, newFilePath)
                return newFilePath
            } else if(file.base64){
                const newFilePath = path.resolve(tempPath, idUtil.createId() + '.' + mime.extension(file.type));
                const buffer = new Buffer.from(file.base64, 'base64');
                fs.writeFileSync(newFilePath,  buffer)
                return newFilePath
            } else if(file.url) {
                try{
                    const result = await axios.get(file.url, {
                        responseType: 'arraybuffer', // 特别注意，需要加上此参数
                    });
                    const newFilePath = path.resolve(tempPath, idUtil.createId() + '.' + mime.extension(result.headers.get("Content-Type")));
                    fs.writeFileSync(newFilePath,  result.data)
                    return newFilePath
                } catch (e) {
                    win.showMessage('图片下载失败', 'error', 2, true)
                    return undefined
                }
            }
        }))
        tempList = tempList && tempList.length > 0 ? tempList.filter(item => item !== undefined) : []
        if(tempList && tempList.length > 0) {
            let error = false
            axios.post(`http://${globalData.config.picGo.host}:${globalData.config.picGo.port}/upload`, { list: tempList }).then(res => {
                if(res.data.success === true){
                    win.insertScreenshotResult({ id: obj.id, list: res.data.result })
                } else {
                    win.showMessage(`图片上传失败，请检查PicGo服务。(错误信息：${res.data.message})`, 'error', 2, true)
                }
            }).catch(err => {
                error = true
                win.showMessage(`图片上传失败，请检查PicGo服务。(错误信息：${err.message})`, 'error', 2 ,true)
            }).finally(() => {
                if(!error){
                    win.closeMessage()
                }
                if(tempList && tempList.length){
                    fsUtil.deleteFileList(tempList)
                }
            })
        }
        return undefined
    }
    if(list && list.length > 0) {
        win.insertScreenshotResult({ id: obj.id, list })
        if(!list.find(item => item === undefined)){
            win.closeMessage()
        }
    }
}

ipcMain.handle('getFileContent', async (event, id) => {
    const fileStateList = globalData.fileStateList
    const fileState = fileStateList.find(item => item.id === id);
    if(!fileState.loaded){
        if(fileState.type === 'local') {
            if(fsUtil.exists(fileState.originFilePath)){
                const content = fs.readFileSync(fileState.originFilePath).toString()
                fileState.content = content
                fileState.tempContent = content
                fileState.loaded = true
                globalData.fileStateList = fileStateList
            } else {
                fileState.type = ''
                fileState.originFilePath = ''
                fileState.exists = false
                globalData.fileStateList = fileStateList
                return { exists: false }
            }
        } else if(fileState.type === 'webdav'){
            if(await webdavUtil.exists(fileState.originFilePath)){
                const content = await webdavUtil.getFileContents(fileState.originFilePath)
                fileState.content = content
                fileState.tempContent = content
                fileState.loaded = true
                globalData.fileStateList = fileStateList
            } else {
                fileState.type = ''
                fileState.originFilePath = ''
                fileState.exists = false
                globalData.fileStateList = fileStateList
                return { exists: false }
            }
        }
    }
    return { exists: true, content: globalData.fileStateList.find(item => item.id === id).tempContent }
})

ipcMain.handle('openDirSelect', event => {
    return settingWin.dirSelect()
})

ipcMain.on('uploadImage', (event, obj) => {
    uploadImage(obj)
})

ipcMain.handle('getConfig', event => {
    return globalData.config
})

ipcMain.on('saveToOther', (event, id) => {
    common.saveToOther(id)
})

ipcMain.on('onContentChange', (event, content, id) => {
    const fileStateList = globalData.fileStateList
    const fileState = fileStateList.find(item => item.id === id)
    fileState.tempContent = content
    fileState.saved = fileState.content.length === content.length && fileState.content === content
    globalData.fileStateList = fileStateList
})

ipcMain.on('openSettingWin', event => {
    settingWin.open()
})


ipcMain.on('settingWinMinimize', () => {
    settingWin.minimize()
})
ipcMain.on('closeSettingWin', () => {
    settingWin.hide()
})

ipcMain.on('updateConfig', (event, config) => {
    globalData.config = config
})

ipcMain.on('exportPdf', event => {
    const fileState = globalData.fileStateList.find(item => item.id === globalData.activeFileId)
    if(!fileState ||fileState.exists === false){
        win.showMessage('未找到当前文件', 'warning')
        return;
    }
    const pdfPath = dialog.showSaveDialogSync({
        title: "导出PDF",
        buttonLabel: "导出",
        defaultPath: path.parse(fileState.fileName).name,
        filters: [
            {name: 'pdf文件', extensions: ['pdf']}
        ]
    })
    if (pdfPath) {
        win.showMessage('导出中...', 'loading', 0)
        exportWin.open(win.get(), pdfPath,  globalData.activeFileId, buffer => {
            fs.writeFile(pdfPath, buffer, () => {
                win.showMessage('导出成功', 'success', 2, true)
            })
        }, () => {
            win.showMessage('导出失败', 'error', 2, true)
        })
    }
})

ipcMain.on('executeExportPdf', () => {
    exportWin.emit('execute-export-pdf')
})

ipcMain.on('toggleSearchBar', event => {
    searchBarWin.toggleSearchBar(win.get())
})

ipcMain.on('findInPage', (event, searchContent) => {
    win.findInPage(searchContent, { findNext: true })
})

ipcMain.on('findInPageNext', (event, searchContent, forward) => {
    win.findInPage(searchContent, { forward, findNext: false })
})

ipcMain.on('stopFindInPage', event => {
    win.stopFindInPage()
})

ipcMain.on('screenshot', (event, id, hide) => {
    const startCapture = () => {
        screenshotsUtil.startCapture((base64, bounds) => {
            uploadImage({ id, fileList: [{ base64, type: 'image/png', isScreenshot: true }] }).then(() => {})
        }, () => {
            if(hide === true) {
                win.show()
            }
        })
    }
    if(hide === true) {
        win.minimize()
        setTimeout(() => {
            startCapture()
        }, 200)
    } else {
        startCapture()
    }
    //setTimeout(() => {
        // const childProcess =  execFile(pathUtil.getSnapShotExePath())
        // childProcess.on('exit', (code) => {
        //     if (code === 0 || code === 1) {
        //         const buffer = clipboard.readImage().toPNG()
        //         if(buffer && buffer.length > 0){
        //             const base64 = buffer.toString('base64')
        //             uploadImage({ id, fileList: [{ base64, type: 'image/png', isScreenshot: true }] }).then(res => {})
        //             clipboard.clear()
        //         }
        //     }
        //     if(hide === true) {
        //         globalData.win.restore()
        //     }
        //     childProcess.kill()
        // })
    //}, 200)
})

ipcMain.on('action', (event, type) => {
    if(type === 'minimize' && globalData.config.minimizeToTray === true){
        win.hide()
    } else {
        win.instanceFuncName(type)
    }
})
ipcMain.on('exit', () => {
    globalShortcutUtil.unregister()
    common.exit()
})
ipcMain.on('restoreDefaultSetting', event => {
    globalData.config = defaultConfig
    settingWin.shouldUpdateConfig(globalData.config)
})

ipcMain.on('openAboutWin', event => {
    aboutWin.open(win.get())
})
ipcMain.on('closeAboutWin', event => {
    aboutWin.hide()
})
ipcMain.on('checkUpdate', event => {
    common.checkUpdate()
})

ipcMain.on('executeDownload', event => {
    common.executeDownload()
})
ipcMain.on('cancelDownload', event => {
    common.cancelDownload()
})

ipcMain.on('executeUpdate', event => {
    common.executeUpdate()
})

ipcMain.on('exportSetting', event => {
    const filePath = dialog.showSaveDialogSync({
        title: "导出设置",
        buttonLabel: "导出",
        defaultPath: 'config.json',
        filters: [
            {name: 'JSON文件', extensions: ['json']},
        ]
    })
    if(filePath){
        fsUtil.exportSetting(globalData.configPath, filePath, () => {
            win.showMessage('导出成功', 'success')
        })
    }
})

ipcMain.on('importSetting', event => {
    const filePath = dialog.showOpenDialogSync({
        title: '导入设置',
        buttonLabel: '导入',
        filters: [
            {name: 'JSON文件', extensions: ['json']},
        ],
        properties: ['openFile']
    })
    if(filePath && filePath.length === 1 && fsUtil.exists(filePath[0])){
        try {
            const json = fsUtil.getJsonFileContent(filePath[0])
            for(const key in defaultConfig){
                if(!json.hasOwnProperty(key)){
                    json[key] = defaultConfig[key]
                }
            }
            globalData.config = json
            win.showMessage('导入成功', 'success')
        } catch (e) {
            win.showMessage('导入失败', 'error')
        }
    }
})

ipcMain.on('newFile', event => {
    common.newFile()
})

ipcMain.on('closeFile', (event, id) => {
    common.closeAndChangeTab(id)
})

ipcMain.on('saveFile', (event, data) => {
    common.saveFile(data)
})

ipcMain.on('updateActiveFileId', (event, id) => {
    globalData.activeFileId = id
})

ipcMain.on('openFolder', (event, id) => {
    const fileState = globalData.fileStateList.find(item => item.id === id)
    if(fileState.originFilePath){
        shell.showItemInFolder(fileState.originFilePath)
    }
})

ipcMain.on('loginWebdav', (event, data) => {
    webdavUtil.login(data, true)
})

ipcMain.handle('webdavGetDirectoryContents', async (event, currentPath) => {
    return await webdavUtil.getDirectoryContents(currentPath)
})

ipcMain.on('webdavLogout', event => {
    webdavUtil.logout()
})

ipcMain.on('openWebdavMd', async (event, filename, basename) => {
    const fileStateList = globalData.fileStateList
    const  find = fileStateList.find(item => item.type === 'webdav' && item.originFilePath === filename)
    if(find) {
        win.changeTab(find.id)
    } else {
        const content = await webdavUtil.getFileContents(filename)
        const create = {
            id: idUtil.createId(),
            saved: true,
            content: content,
            tempContent: content,
            originFilePath: filename,
            fileName: basename,
            type: 'webdav'
        }
        fileStateList.push(create)
        globalData.fileStateList = fileStateList
        win.changeTab(create.id)
    }
})

ipcMain.handle('getLoginInfo', async () => {
    return await webdavUtil.getLoginInfo()
})

ipcMain.handle('getFileStateList', () => {
    return globalData.fileStateList.map(item => {
        return {
            id: item.id,
            saved: item.saved,
            originFilePath: item.originFilePath,
            fileName: item.fileName,
            type: item.type
        }
    })
})

ipcMain.on('checkAutoLogin', () => {
    webdavUtil.autoLogin()
})
