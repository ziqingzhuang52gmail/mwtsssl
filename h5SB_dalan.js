/*
 * @Author: chl
 * @Date: 2025-04-03 19:36:14
 * @LastEditors: chl
 * @LastEditTime: 2026-05-29 17:41:17
 * @FilePath: /stable/tools/h5SDKBinding/h5SB_dalan.js
 * @Email: haolin.chen1991@gmail.com
 * @Description: 
 * http://open.aidalan.com/docs/mir_sdk/doc
 */

var ADS_STATUS = {
    FAIL: 0,
    CANCEL: 1,
    TIMEOUT: 2,
    SUCCESS: 3,
    FREE: 4
};

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min; //The maximum is exclusive and the minimum is inclusive
}

var check = function () {
    /* function doCheck(a) {
        if (('' + a / a)['length'] !== 1 || a % 20 === 0) {
            (function () { }['constructor']('debugger')());
        } else {
            (function () { }['constructor']('debugger')());
        }
        doCheck(++a);
    }
    try {
        doCheck(0);
    } catch (err) { } */
};

class H5Platform {
    constructor() {
        this._lastLoginTM = 0 //上一次发起登录请求的时间戳（防止玩家快速多次点击登录）
        this._inLoginWorking = false
        this._osCode = 2
        this._isBlockRecharge = false
        this._sdk = null
        this._isSwitchingServer = false
    }

    init() {
        var checkConfigObj = JSON.parse(getRemoteAgent().checkConfig)
        if (checkConfigObj.indexOf("EnableConsoleLog:1") != -1) {

        } else {
            setInterval(function () {
                check();
            }, 2000);
            check();
        }

        loadSingleScript(`./wdSdk.min.js?v=${new Date().getTime()}`, () => {
            this._sdk = window._hm;
            parseURL();
            if (getUrlKV()['send_zd_reward'] == 1) {
                console.warn('来自转端入口');

                getUrlKV()['AddedToAppGift_CanGetReward'] = 1
                getUrlKV()['ShowAddedToAppGift'] = 1
            }

            var remoteConfig = getRemoteAgent()
            if (getUrlKV()['dyqd'] == 1 && remoteConfig) {
                let checkConfig = JSON.parse(remoteConfig['checkConfig'])
                checkConfig.push('VoucherShopBlockPrices:[4998]')
                remoteConfig["checkConfig"] = JSON.stringify(checkConfig)
            }
        }
		)
    }

    nodeRecord(node_id) {
        console.log("H5Platform nodeRecord", node_id)
    }

    getOsCode() {
        return this._osCode
    }

    restart() {
        if (this._isSwitchingServer) return

        this._sdk.reloadGame()
    }

    exitGame() {
        this._sdk.reloadGame()
    }

    openKefu() {
        window.location = 'https://f.aidalan.com/mini_game/7373765c9aa588b06c10ded266d23946.png'
    }

    _getPhpLoginData() {
        let data = window.__phpLogin || {};
        let uid = data.uid || window.uid || window.account || '';
        let pass = data.pass || window.pass || window.password || '';
        uid = String(uid || '').trim();
        pass = String(pass || '');
        if (!uid || !pass) {
            return null;
        }
        return { uid, pass };
    }

    login(cb) {
        if (this._inLoginWorking) {
            return
        }
        if (Date.now() - this._lastLoginTM < 1000) {
            console.log("XyxPlatform login 防止多次点击")
            return
        }
        console.log("XyxPlatform login")
        this._lastLoginTM = Date.now()
        this._inLoginWorking = true

        let phpLoginData = this._getPhpLoginData();
        if (phpLoginData) {
            console.log("XyxPlatform login use index.php params", phpLoginData.uid)
            this._inLoginWorking = false
            cb({
                token: phpLoginData.pass,
                uid: phpLoginData.uid,
                ext: {
                    account: phpLoginData.uid,
                    password: phpLoginData.pass,
                    game_ver: '1.0.0',
                },
                isBlockRecharge: false,
            })
            return
        }

        this._sdk.initSdk((res) => {
            console.log(res, '一次登录成功')
            this._inLoginWorking = false
            cb({
                token: res.session_id,
                uid: res.uid,
                ext: {
                    channel_id: res.channel_id,
                    game_channel_id: res.game_channel_id,
                    game_id: res.game_id,
                    game_name: res.game_name,
                    game_ver: '1.0.0',
                    openId: res.openid,
                    select_server: res.select_server,
                },
                isBlockRecharge: false,
            })
        })
    }

    loginOut() {
        this._sdk.logout((ret) => {
            if (ret == 1) {
                console.log("切换帐号成功")
                this.restart()
            }
        });
    }

    share(params, cb) {
        cb && cb();
    }

    purchase(params, cb) {
        console.log("XyxPlatform purchase", params)

        let orderInfo = {
            order_id: params.orderId,
            role_uid: params.playerId,
            role_name: params.name,
            role_level: params.level,
            server_id: params.serverId,
            server_name: params.serverName,
            product_name: params.itemName,
            product_id: params.itemId,
            pay_info: params.itemName,
            product_count: params.count,
            real_pay_money: params.itemPrice * 100,
            notify_url: params.notifyUrl,
            extra_data: '',
            rate: '10',
            currency_code: 'RMB',
            gift_type_id: params.giftTypeId,
            product_count_limit: params.productCountLimit,
            notify_url: getLocalAgent()['PaySerever'] || 'https://menggui-api.bhsg.lintey.com/sy_pay/wechat_pay.php',
        };

        this._sdk.buy(orderInfo, (res) => {
            console.log(res, '支付回调');
            // this.callJsFunc(this, [{
            //     type: "purchaseCB",
            //     result: "success",
            //     data: {
            //         orderId: params.orderId,
            //         platform: "wechat",
            //         // qrCode: data.content.url,
            //     }
            // }])
        });
    }

    gameReport(params) {
        console.log("XyxPlatform gameReport", params.type)

        var type = params.type;
        var data = params.data;
        var report_data = {};

        switch (type) {
            case 'LoadLoginView': {
                return;
            }
            case 'LoadLoginViewDone': {
                return;
            }
            case 'LoadPreConfig': {
                return;
            }
            case 'LoadPreConfigDone': {
                return;
            }
            case 'ParsePreConfigDone': {
                return;
            }
            case 'RequirePhpLogin': {
                return;
            }
            case 'PhpLoginSucc': {
                return;
            }
            case 'PhpLoginFail': {
                return;
            }
            case 'SelectServer':
                report_data.action = 1;
                break;
            case 'CreateRole':
                report_data.action = 2;
                break;
            case 'StartGameLogic':
                // 进入游戏
                report_data.action = 6;
                // 同时上报选服
                setTimeout(() => {
                    params.type = 'SelectServer';
                    this.gameReport(params);
                }, 500);
                break;
            case 'RoleUpLevel':
                // 等级提升
                report_data.action = 3;
                break;
            case 'RoleRename':
                // 改名
                report_data.action = 5;
                break;
            case 'GuildCompleted':
                // 完成新手指引
                report_data.event = 'tutorial_finish'
                break;
            case 'HangUpLevelChanged':
                // 主线推关
                report_data.event = 'depth_action'
                report_data.id = '2'
                report_data.level = String(data.hangup_level)
                break;
        }

        if (report_data.action) {
            report_data.server_id = String(data.sid);
            report_data.server_name = String(data.s_name);
            report_data.role_id = String(data.role_id);
            report_data.role_name = String(data.role_name);
            report_data.role_level = Number(data.role_level);
            report_data.vip_level = String(data.vip_level);
            report_data.role_create_time = String(data.roleCreateDt)
            report_data.role_update_time = String(Date.now())
            report_data.role_online_time = String(data.roleOnlineTime)
            report_data.role_type = '-1'
            report_data.balance = String(data.playerCurrentMoney)
            report_data.role_gender = 'male'
            report_data.role_online_time = '-1'
            report_data.role_power = String(data.fightCap || -1)
            report_data.camp_id = '-1'
            report_data.camp_name = '-1'
            report_data.association_id = String(data.party_id)
            report_data.party_name = data.party_name
            report_data.association_rank = String(data.party_rank)
            report_data.association_position = String(data.party_position)
            report_data.zone_id = String(data.sid)
            report_data.zone_name = data.s_name
            report_data.extra_data = {
                role_power: String(data.fightCap || -1),
                role_vip_level: String(data.vip_level),
            }
            // p.role_partyname = data.party_name
            // p.uid = Number(data.uuid)
            // p.role_currency = Number(data.playerCurrentMoney)
            // p.role_sex = 1
            // p.role_career = "sheep"
           // this._sdk.uploadUserData(report_data);
        } else if (report_data.event) {
           // this._sdk.getClickData(report_data);
        }
    }

    cmd(params, cb) {
        if (!params.type) return cb && cb();

        switch (params.type) {
            case 'LoginRsp': {
                let data = params.data
                this._sdk.onLoginRsp({
                    prefix: data.prefix,
                    token: data.access_token,
                    uid: data.game_uin
                })
                break;
            }
            case 'SwitchServer': {
                // this._isSwitchingServer = true
                // this._sdk.logout((ret) => {
                //     if (ret == 1) {
                //         console.log("切换帐号成功")
                //         this._sdk.reloadGame()
                //     }
                // });
                break;
            }
            case "CheckTextVaild": {
                this._sdk.XHCheckContent({
                    content: params.text,
                    scene: 2
                }, (code, msg, data) => {
                    if (code == 200) {
                        cb && cb({
                            vaild: true,
                        })
                    } else {
                        console.info()
                        cb && cb({
                            vaild: false,
                        })
                    }
                })
                break;
            }
            case 'SetDebugModel': {
                // 通过Utils.agentConfig.IsDebug启动log输出

                var needDebugInfo = params.log;
                var __originalLog = console.log;
                console.log = function (...msg) {
                    if (needDebugInfo) {
                        const d = new Date()
                        __originalLog(`${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}:${d.getMilliseconds()}`, ...msg)
                    }
                }
                var __originalWarn = console.warn;
                console.warn = function (...msg) {
                    const d = new Date()
                    __originalWarn(`${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}:${d.getMilliseconds()}`, ...msg)
                }

                // 这个console开了就不能关，太危险了
                // if (wx.setEnableDebug && params.value)
                //     wx.setEnableDebug({
                //         enableDebug: true
                //     })
                break;
            }
            case "hmGameReport": {
                let event = params.event;
                let id = params.id;
                _hm.getClickData({
                    event: event,
                    id: id,
                })
                console.log('H5微端SDK数据埋点上报--event:', event, '--id:', id);
                break
            }
            case "ShowKefuImage": {
                // 创建弹窗容器
                let popup = document.getElementById('imagePopup');
                if (!popup) {
                    popup = document.createElement('div');
                    popup.id = 'imagePopup';
                    popup.style.position = 'fixed';
                    popup.style.top = '0';
                    popup.style.left = '0';
                    popup.style.width = '100%';
                    popup.style.height = '100%';
                    popup.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
                    popup.style.zIndex = '9999';
                    popup.style.display = 'flex';
                    popup.style.justifyContent = 'center';
                    popup.style.alignItems = 'center';
                    popup.style.cursor = 'pointer';

                    // 图片容器
                    let imgContainer = document.createElement('div');
                    imgContainer.style.maxWidth = '90%';
                    imgContainer.style.maxHeight = '90%';
                    imgContainer.style.cursor = 'default';

                    // 图片元素
                    let img = document.createElement('img');
                    img.src = 'https://f.aidalan.com/mini_game/7373765c9aa588b06c10ded266d23946.png';
                    img.style.maxWidth = '100%';
                    img.style.maxHeight = '100%';
                    img.style.borderRadius = '8px';
                    img.style.cursor = 'zoom-in';

                    // 关闭按钮
                    let closeBtn = document.createElement('span');
                    closeBtn.textContent = '×';
                    closeBtn.style.position = 'absolute';
                    closeBtn.style.top = '20px';
                    closeBtn.style.right = '20px';
                    closeBtn.style.fontSize = '30px';
                    closeBtn.style.color = 'white';
                    closeBtn.style.cursor = 'pointer';
                    closeBtn.style.zIndex = '10000';
                    closeBtn.style.width = '30px';
                    closeBtn.style.height = '30px';
                    closeBtn.style.display = 'flex';
                    closeBtn.style.justifyContent = 'center';
                    closeBtn.style.alignItems = 'center';
                    closeBtn.style.borderRadius = '50%';
                    closeBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';

                    // 将元素添加到DOM中
                    imgContainer.appendChild(img);
                    popup.appendChild(imgContainer);
                    popup.appendChild(closeBtn);
                    document.body.appendChild(popup);

                    // 点击弹窗背景关闭
                    popup.addEventListener('click', function (e) {
                        if (e.target === popup) {
                            document.body.removeChild(popup);
                        }
                    });

                    // 点击关闭按钮关闭
                    closeBtn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        document.body.removeChild(popup);
                    });

                    // 点击图片放大效果
                    img.addEventListener('click', function (e) {
                        e.stopPropagation();
                        if (this.style.transform === 'scale(1.5)') {
                            this.style.transform = 'scale(1)';
                        } else {
                            this.style.transform = 'scale(1.5)';
                        }
                    });
                } else {
                    // 如果弹窗已存在，则重新显示
                    popup.style.display = 'flex';
                }
                break
            }
            case "JueSeMa": {
				this._sdk.getCodeInfo({
					success: (res) => {
						console.log('获取角色码成功', res)
						if (res && res.content && res.content.copy_str) {
							this._copyToClipBoard(res.content.copy_str, (ok) => {
								this._showToast(ok ? '复制成功' : '复制失败');
							});
						}
					}
				})
				break;
			}
        }
    }

    /** H5 复制到剪贴板（与 H5Sdk.copyToClipBoard 一致） */
    _copyToClipBoard(text, cb) {
        try {
            const input = document.createElement('input');
            input.readOnly = true;
            input.value = text;
            document.body.appendChild(input);
            input.select();
            input.setSelectionRange(0, input.value.length);
            document.execCommand('Copy');
            document.body.removeChild(input);
            cb && cb(true);
        } catch (e) {
            console.warn(e);
            cb && cb(false);
        }
    }

    /** H5 轻提示（替代 wx.showToast） */
    _showToast(title, duration = 2000) {
        const id = 'h5-dalan-toast';
        const old = document.getElementById(id);
        if (old) {
            old.parentNode.removeChild(old);
        }
        const el = document.createElement('div');
        el.id = id;
        el.textContent = title;
        el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);padding:10px 16px;background:rgba(0,0,0,0.75);color:#fff;font-size:14px;border-radius:6px;z-index:99999;pointer-events:none;';
        document.body.appendChild(el);
        setTimeout(() => {
            if (el.parentNode) {
                el.parentNode.removeChild(el);
            }
        }, duration);
    }

    showAds(params, cb, extInfoParams) {
        if (!params) return
        this._adsStateCB = cb

        if (getUrlKV()['show_ad_enter'] == 1) {
            this._sdk.showRewordVideoAd((res) => {
                console.log('广告结果', res);
                if (!this._adsStateCB) return

                if (res.ret == 1) {
                    this._adsStateCB(ADS_STATUS.SUCCESS)
                } else {
                    this._adsStateCB(ADS_STATUS.FAIL)
                }
            });
        } else {
            console.log('不用看广告');
            this._adsStateCB && this._adsStateCB(ADS_STATUS.SUCCESS)
        }
    }
}

window._h5_platform = new H5Platform();
