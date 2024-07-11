import {app, shell} from 'electron'
import {ipcMain, dialog} from 'electron'
import { exec } from 'child_process'
import fs from 'fs'
import globalData from './globalData.js'
import common from './common.js'
import path from 'path'
import pathUtil from './pathUtil.js'
import fsUtil from './fsUtil.js'
import axios from 'axios'
import mime from 'mime-types'
import defaultConfig from '../constant/defaultConfig.js'
import webdavUtil from "./webdavUtil.js";
import screenshotsUtil from "./screenshotsUtil.js";
import globalShortcutUtil from "./globalShortcutUtil.js";
import exportWin from "../win/exportWin.js";
import settingWin from "../win/settingWin.js";
import aboutWin from "../win/aboutWin.js";
import searchBarWin from "../win/searchBarWin.js";
import win from "../win/win.js";
import config from "../local/config.js";
import util from "./util.js";
import fileState from "../runtime/fileState.js";

const isBase64Img = files => {
    return files.find(item => item.base64) !== undefined
}

const uploadImage = async obj => {
    const files = obj.fileList
    const fileStateItem = fileState.getById(obj.id)
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
        if((insertImgType === '2' || insertImgType === '3') && !fileStateItem.originFilePath){
            win.showMessage('当前文件未保存，不能将图片保存到相对位置', 'error', 2, true)
            return undefined
        }
        let savePath
        try {
            savePath = common.getImgParentPath(fileStateItem, insertImgType)
        } catch (e) {
            win.showMessage('图片保存路径创建失败,请检查相关设置是否正确', 'error', 2, true)
            return undefined
        }
        list = await Promise.all(files.map(async file => {
            if(file.path){
                const newFilePath = path.join(savePath, util.createId() + '.' + mime.extension(file.type));
                if(fileStateItem.type === 'local' || insertImgType === '4'){
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
                const newFilePath = path.join(savePath, util.createId() + '.' + mime.extension(file.type));
                const buffer = new Buffer.from(file.base64, 'base64');
                if(fileStateItem.type === 'local' || insertImgType === '4'){
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
                    const newFilePath = path.join(savePath, util.createId() + '.' + mime.extension(result.headers.get("Content-Type")));
                    if(fileStateItem.type === 'local' || insertImgType === '4'){
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
        if(!config.data.picGo.host || !config.data.picGo.port) {
            win.showMessage('请配置PicGo服务信息', 'error', 2, true)
            return undefined
        }
        const tempPath = pathUtil.getTempPath()
        let tempList = await Promise.all(files.map(async file => {
            if(file.path){
                const newFilePath = path.resolve(tempPath, util.createId() + '.' + mime.extension(file.type));
                fs.copyFileSync(file.path, newFilePath)
                return newFilePath
            } else if(file.base64){
                const newFilePath = path.resolve(tempPath, util.createId() + '.' + mime.extension(file.type));
                const buffer = new Buffer.from(file.base64, 'base64');
                fs.writeFileSync(newFilePath,  buffer)
                return newFilePath
            } else if(file.url) {
                try{
                    const result = await axios.get(file.url, {
                        responseType: 'arraybuffer', // 特别注意，需要加上此参数
                    });
                    const newFilePath = path.resolve(tempPath, util.createId() + '.' + mime.extension(result.headers.get("Content-Type")));
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
            axios.post(`http://${config.data.picGo.host}:${config.data.picGo.port}/upload`, { list: tempList }).then(res => {
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
    const fileStateItem = fileState.getById(id)
    if(!fileStateItem.loaded){
        if(fileStateItem.type === 'local') {
            if(fsUtil.exists(fileStateItem.originFilePath)){
                const content = fs.readFileSync(fileStateItem.originFilePath).toString()
                fileStateItem.content = content
                fileStateItem.tempContent = content
                fileStateItem.loaded = true
            } else {
                fileStateItem.type = ''
                fileStateItem.originFilePath = ''
                fileStateItem.exists = false
                return { exists: false }
            }
        } else if(fileStateItem.type === 'webdav'){
            if(await webdavUtil.exists(fileStateItem.originFilePath)){
                const content = await webdavUtil.getFileContents(fileStateItem.originFilePath)
                fileStateItem.content = content
                fileStateItem.tempContent = content
                fileStateItem.loaded = true
            } else {
                fileStateItem.type = ''
                fileStateItem.originFilePath = ''
                fileStateItem.exists = false
                return { exists: false }
            }
        }
    }
    return { exists: true, content: fileStateItem.tempContent }
})

ipcMain.handle('openDirSelect', event => {
    return settingWin.dirSelect()
})

ipcMain.on('generateDocxTemplate', () => {
    if(config.data.pandocPath){
        const templatePath = path.resolve(config.data.pandocPath, 'wj-markdown-editor-reference.docx');
        fs.access(templatePath, fs.constants.F_OK, err => {
            if(err){
                const childProcess = exec('pandoc -o wj-markdown-editor-reference.docx --print-default-data-file reference.docx', { cwd: config.data.pandocPath });
                childProcess.on('close', () => {
                    shell.showItemInFolder(templatePath)
                })
            } else {
                shell.showItemInFolder(templatePath)
            }
        })
    }
})

ipcMain.on('uploadImage', (event, obj) => {
    uploadImage(obj)
})

ipcMain.handle('getConfig', event => {
    return util.deepCopy(config.data)
})

ipcMain.on('saveToOther', (event, id) => {
    common.saveToOther(id)
})

ipcMain.on('onContentChange', (event, content, id) => {
    const fileStateItem = fileState.getById(id)
    fileStateItem.tempContent = content
    fileStateItem.saved = fileStateItem.content.length === content.length && fileStateItem.content === content
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

ipcMain.on('updateConfig', (event, newConfig) => {
    util.setByKey(newConfig, config.data)
})

ipcMain.on('exportWord', () => {
    const fileStateItem = fileState.getById(globalData.activeFileId)
    if(!fileStateItem ||fileStateItem.exists === false){
        win.showMessage('未找到当前文件', 'warning')
        return;
    }
    if(!config.data.pandocPath){
        win.showMessage('请先配置pandoc地址', 'warning')
        return;
    }
    if(!fileStateItem.saved || !fileStateItem.type){
        win.showMessage('请先保存文件', 'warning')
        return;
    }
    const execute = (docxPath, p, shouldDelete) => {
        let success = true
        let cmd = `pandoc ${p} -o ${docxPath} --from markdown --to docx --resource-path="${path.dirname(p)}"`
        if(fsUtil.exists(path.resolve(config.data.pandocPath, 'wj-markdown-editor-reference.docx'))){
            cmd += ' --reference-doc=wj-markdown-editor-reference.docx'
        }
        const childProcess = exec(cmd, { cwd: config.data.pandocPath });
        childProcess.stderr.on('data', function (data) {
            success = false
        })
        // 退出之后的输出
        childProcess.on('close', function (code) {
            if(code === 0 && success === true) {
                win.showMessage('导出成功', 'success', 2, true)
            } else {
                win.showMessage('导出完成，但遇到一些未知问题。', 'warning', 10, true)
            }
            if(shouldDelete){
                fs.unlink(p, () => {})
            }
        })
    }
    const docxPath = dialog.showSaveDialogSync({
        title: "导出word",
        buttonLabel: "导出",
        defaultPath: path.parse(fileStateItem.fileName).name,
        filters: [
            {name: 'docx文件', extensions: ['docx']}
        ]
    })
    if(docxPath){
        win.showMessage('导出中...', 'loading', 0)
        if(fileStateItem.type === 'webdav'){
            const currentPath = path.resolve(pathUtil.getTempPath(), util.createId() + '.md')
            fs.writeFile(currentPath, fileStateItem.tempContent, () => {
                execute(docxPath, currentPath, true)
            })
        } else {
            execute(docxPath, fileStateItem.originFilePath, false)
        }
    }
})

ipcMain.on('exportPdf', event => {
    const fileStateItem = fileState.getById(globalData.activeFileId)
    if(!fileStateItem ||fileStateItem.exists === false){
        win.showMessage('未找到当前文件', 'warning')
        return;
    }
    const pdfPath = dialog.showSaveDialogSync({
        title: "导出为PDF",
        buttonLabel: "导出",
        defaultPath: path.parse(fileStateItem.fileName).name,
        filters: [
            {name: 'pdf文件', extensions: ['pdf']}
        ]
    })
    if (pdfPath) {
        win.showMessage('导出中...', 'loading', 0)
        exportWin.open(win.get(), pdfPath,  globalData.activeFileId, 'pdf',buffer => {
            fs.writeFile(pdfPath, buffer, () => {
                win.showMessage('导出成功', 'success', 2, true)
            })
        }, () => {
            win.showMessage('导出失败', 'error', 2, true)
        })
    }
})

ipcMain.on('exportImage', event => {
    const fileStateItem = fileState.getById(globalData.activeFileId)
    if(!fileStateItem ||fileStateItem.exists === false){
        win.showMessage('未找到当前文件', 'warning')
        return;
    }
    const imgPath = dialog.showSaveDialogSync({
        title: "导出为图片",
        buttonLabel: "导出",
        defaultPath: path.parse(fileStateItem.fileName).name,
        filters: [
            {name: 'png文件', extensions: ['png']}
        ]
    })
    if (imgPath) {
        win.showMessage('导出中...', 'loading', 0)
        exportWin.open(win.get(), imgPath,  globalData.activeFileId, 'img', buffer => {
            fs.writeFile(imgPath, buffer, () => {
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

ipcMain.on('executeExportImg', (event, base64) => {
    exportWin.emit('execute-export-img', base64)
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
    if(type === 'minimize' && config.data.minimizeToTray === true){
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
    util.setByKey(defaultConfig.get(), config.data)
    settingWin.shouldUpdateConfig(util.deepCopy(config.data))
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
        fsUtil.exportSetting(pathUtil.getConfigPath(), filePath, () => {
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
            const defaultConfigObj = defaultConfig.get()
            for(const key in defaultConfigObj){
                if(!json.hasOwnProperty(key)){
                    json[key] = defaultConfigObj[key]
                }
            }
            util.setByKey(json, config.data)
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
    const fileStateItem = fileState.getById(id)
    if(fileStateItem.originFilePath){
        shell.showItemInFolder(fileStateItem.originFilePath)
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
    const  find = fileState.find(item => item.type === 'webdav' && item.originFilePath === filename)
    if(find) {
        win.changeTab(find.id)
    } else {
        const content = await webdavUtil.getFileContents(filename)
        const create = {
            id: util.createId(),
            saved: true,
            content: content,
            tempContent: content,
            originFilePath: filename,
            fileName: basename,
            type: 'webdav'
        }
        fileState.push(create)
        win.changeTab(create.id)
    }
})

ipcMain.handle('getLoginInfo', async () => {
    return await webdavUtil.getLoginInfo()
})

ipcMain.handle('getFileStateList', () => {
    return fileState.get().map(item => {
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

ipcMain.handle('getCurrentVersion', () => {
    return app.getVersion()
})
