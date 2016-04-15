/*
 * Copyright 2015 Alexander Pustovalov
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { forOwn, has, template } from 'lodash';
import path from 'path';
import * as fileManager from '../commons/fileManager.js';
import * as config from '../commons/configuration.js';
import * as sandboxConfig from './configuration.js';
import * as indexManager from '../commons/indexManager.js';
import * as npmUtils from '../commons/npmUtils.js';

function repairPath(path){
    if(path.substr(0, 1) !== '.'){
        path = './' + path;
    }
    return path;
}

export function initGeneratorData(groupName, componentName, metadata) {
    return sandboxConfig.init(path.join(config.sandboxDirPath(), 'work'))
        .then(() => {
            let fileReaders = [];
            let project = sandboxConfig.getProjectConfig();
            let fileSources = {};
            forOwn(project.conf.files, (value, prop) => {
                fileReaders.push(
                    fileManager.readFile(value)
                        .then(fileData => {
                            fileSources[prop] = fileData;
                        })
                );
            });
            return Promise.all(fileReaders)
                .then(() => {
                    project.conf.sources = fileSources;
                    return {groupName, componentName, metadata, project};
                });
        });
}

export function installDependencies(dependencies) {
    if (dependencies) {
        const projectConfig = config.getProjectConfig();
        if (!has(projectConfig, 'conf.paths.assetsDirPath')) {
            return Promise.reject('Wrong project configuration. \'assetsDirPath\' field is missing.');
        }
        if (!has(projectConfig, 'conf.files.assetsIndexFilePath')) {
            return Promise.reject('Wrong project configuration. \'assetsIndexFilePath\' field is missing.');
        }
        const { packages } = dependencies;
        if (packages && packages.length > 0) {
            let installTask = Promise.resolve();
            let packageNames = '';
            packages.forEach(pkg => {
                installTask = installTask.then(() => {
                    return npmUtils.getPackageAbsolutePath(pkg.name, config.projectDir())
                        .then(packagePath => {
                            console.log('Found path: ' + packagePath);
                            if (!packagePath) {
                                const version = pkg.version && pkg.version.trim().length > 0 ? '@' + pkg.version.trim() : '';
                                packageNames += pkg.name + version + ' ';
                            }
                        });
                })
            });
            installTask = installTask.then(() => {
                packageNames = packageNames.substr(0, packageNames.length - 1);
                console.log('Gathered packages: ' + packageNames);
                if (packageNames && packageNames.length > 0) {
                    console.log('Install packages: ' + packageNames);
                    return npmUtils.installPackages(packageNames, config.projectDir());
                }
            });
            packages.forEach(pkg => {
                const { copy } = pkg;
                if (copy && copy.length > 0) {
                    let absDirPath;
                    installTask = installTask.then(() => {
                        return npmUtils.getPackageAbsolutePath(pkg.name, config.projectDir())
                            .then(packagePath => {
                                if(!packagePath){
                                    throw Error('Package ' + pkg.name + ' was not installed properly.');
                                }
                                absDirPath = packagePath;
                            });
                    });
                    copy.forEach(copyItem => {
                        installTask = installTask.then(() => {
                            console.log('Copy from path: ' + absDirPath);
                            const absSrcPath = path.join(absDirPath, copyItem.from);
                            const absDestPath = path.join(projectConfig.conf.paths.assetsDirPath, copyItem.to);
                            return fileManager.copyFile(absSrcPath, absDestPath);
                        });
                    });
                }
            });

            return installTask;
        }
    }
    return Promise.resolve();
}

export function saveGenerated(files) {
    let fileSavers = [];
    let componentFilePath;
    files.forEach(fileObject => {
        if (fileObject.isComponent) {
            componentFilePath = fileObject.outputFilePath;
        }
        fileSavers.push(
            fileManager.ensureFilePath(fileObject.outputFilePath).then(() => {
                return fileManager.writeFile(fileObject.outputFilePath, fileObject.sourceCode, false);
            })
        );
    });
    return Promise.all(fileSavers)
        .then(() => {
            return fileManager.readFile(sandboxConfig.deskPageTemplatePath());
        })
        .then(pageForDeskTemplateText => {
            if (componentFilePath) {
                const indexFileDirPath = sandboxConfig.deskSourceDirPath();
                const componentRelativePath = path.relative(indexFileDirPath, componentFilePath).replace(/\\/g, '/');
                const pageForDeskTemplate = template(pageForDeskTemplateText);
                return fileManager.writeFile(
                    path.join(sandboxConfig.deskSourceDirPath(), 'PageForDesk.js'),
                    pageForDeskTemplate({componentRelativePath}),
                    false
                );
            }
    });
}