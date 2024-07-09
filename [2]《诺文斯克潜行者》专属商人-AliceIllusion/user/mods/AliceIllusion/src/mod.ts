import { DependencyContainer } from "tsyringe";
import { IPreAkiLoadMod } from "@spt-aki/models/external/IPreAkiLoadMod";
import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { PreAkiModLoader } from "@spt-aki/loaders/PreAkiModLoader";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { ImageRouter } from "@spt-aki/routers/ImageRouter";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { ITraderAssort, ITraderBase } from "@spt-aki/models/eft/common/tables/ITrader";
import { ITraderConfig, UpdateTime } from "@spt-aki/models/spt/config/ITraderConfig";
import { IRagfairConfig } from "@spt-aki/models/spt/config/IRagfairConfig";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { IDatabaseTables } from "@spt-aki/models/spt/server/IDatabaseTables";
import * as baseJson from "../db/base.json";
import { Traders } from "@spt-aki/models/enums/Traders";
import * as assortJson from "../db/assort.json";
import * as path from "path";
import { LogTextColor } from "@spt-aki/models/spt/logging/LogTextColor";
import { LogBackgroundColor } from "@spt-aki/models/spt/logging/LogBackgroundColor";

const fs = require('fs');
const modPath = path.normalize(path.join(__dirname, '..'));

class AliceIllusion implements IPreAkiLoadMod, IPostDBLoadMod {
    private mod = "AliceIllusion";
    private logger: ILogger;
    private configServer: ConfigServer;
    private ragfairConfig: IRagfairConfig;

    constructor() {
        this.mod = "AliceIllusion";
    }

    public preAkiLoad(container: DependencyContainer): void {
        this.logger = container.resolve<ILogger>("WinstonLogger");
        this.logger.debug(`[${this.mod}] preAki Loading...`);

        const preAkiModLoader = container.resolve<PreAkiModLoader>("PreAkiModLoader");
        const imageRouter = container.resolve<ImageRouter>("ImageRouter");
        this.configServer = container.resolve<ConfigServer>("ConfigServer");

        const traderConfig = this.configServer.getConfig<ITraderConfig>(ConfigTypes.TRADER);
        this.ragfairConfig = this.configServer.getConfig<IRagfairConfig>(ConfigTypes.RAGFAIR);

        this.registerProfileImage(preAkiModLoader, imageRouter);
        this.setupTraderUpdateTime(traderConfig);
        this.addTraderToFleaMarket();

        this.logger.debug(`[${this.mod}] preAki Loaded`);
    }

    public postDBLoad(container: DependencyContainer): void {
        this.logger.debug(`[${this.mod}] postDb Loading...`);

        const databaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        const jsonUtil = container.resolve<JsonUtil>("JsonUtil");
        const tables = databaseServer.getTables();
        const pkg = require("../package.json");

        this.addTraderToDb(baseJson, tables, jsonUtil);
        this.addTraderToLocales(tables);

        this.logger.debug(`[${this.mod}] postDb Loaded`);
        this.logger.logWithColor(`${pkg.name} 《诺文斯克潜行者》整合包专属商人已加载`, LogTextColor.BLUE, LogBackgroundColor.YELLOW);
    }

    private registerProfileImage(preAkiModLoader: PreAkiModLoader, imageRouter: ImageRouter): void {
        const imageFilepath = `./${preAkiModLoader.getModPath(this.mod)}res`;
        imageRouter.addRoute(baseJson.avatar.replace(".jpg", ""), `${imageFilepath}/AliceIllusion.jpg`);
    }

    private setupTraderUpdateTime(traderConfig: ITraderConfig): void {
        const traderRefreshRecord: UpdateTime = { traderId: baseJson._id, seconds: { min: 1000, max: 6000 } };
        traderConfig.updateTime.push(traderRefreshRecord);
    }

    private addTraderToFleaMarket(): void {
        this.ragfairConfig.traders[baseJson._id] = true;
        Traders[this.mod] = this.mod;
    }

    private addTraderToDb(traderDetails: any, tables: IDatabaseTables, jsonUtil: JsonUtil): void {
        tables.traders[traderDetails._id] = {
            assort: jsonUtil.deserialize(jsonUtil.serialize(assortJson)) as ITraderAssort,
            base: jsonUtil.deserialize(jsonUtil.serialize(traderDetails)) as ITraderBase,
            questassort: { started: {}, success: {}, fail: {} }
        };
    }

    private addTraderToLocales(tables: IDatabaseTables): void {
        const locales = Object.values(tables.locales.global) as Record<string, string>[];
        locales.forEach(locale => {
            locale[`${baseJson._id} FullName`] = baseJson.name;
            locale[`${baseJson._id} FirstName`] = "AliceIllusion";
            locale[`${baseJson._id} Nickname`] = baseJson.nickname;
            locale[`${baseJson._id} Location`] = baseJson.location;
            locale[`${baseJson._id} Description`] = "";
        });
    }

    public loadFiles(dirPath: string, extName: string[], cb: (filePath: string) => void): void {
        if (!fs.existsSync(dirPath)) return;
        const dir = fs.readdirSync(dirPath, { withFileTypes: true });
        dir.forEach(item => {
            const itemPath = path.normalize(`${dirPath}/${item.name}`);
            if (item.isDirectory()) {
                this.loadFiles(itemPath, extName, cb);
            } else if (extName.includes(path.extname(item.name))) {
                cb(itemPath);
            }
        });
    }

    private getPresets(container: DependencyContainer, assortTable, currency, profiles) {
        const jsonUtil = container.resolve<JsonUtil>("JsonUtil");
        const RagfairPriceService = container.resolve<RagfairPriceService>("RagfairPriceService");
        let pool = [];
        for (let p in (profiles || [])) {
            for (let wbk in profiles[p].userbuilds.weaponBuilds) {
                let wb = profiles[p].userbuilds.weaponBuilds[wbk];
                let preItems = wb.items;
                let id = preItems[0]._id;
                let tpl = preItems[0]._tpl;
                if (pool.includes(id)) {
                    continue;
                }
                pool.push(id)
                preItems[0] = {
                    "_id": id,
                    "_tpl": tpl,
                    "parentId": "hideout",
                    "slotId": "hideout",
                    "BackgroundColor": "yellow",
                    "upd": {
                        "UnlimitedCount": true,
                        "StackObjectsCount": 2000
                    },
                    "preWeapon": true
                };
                let preItemsObj = jsonUtil.clone(preItems);
                for (let preItemObj of preItemsObj) {
                    assortTable.items.push(preItemObj);
                }
                let config;
                try {
                    config = require(`../config/config.json`);
                } catch (e) {
                }
                let price = (config || {}).cost || 7500;
                try {
                    price = RagfairPriceService.getDynamicOfferPriceForOffer(preItems,currency);
                } catch (error) {
                    
                }
                let offerRequire = [
                    {
                        "count": price,
                        "_tpl": currency
                    }
                ];
                assortTable.barter_scheme[id] = [offerRequire];
                assortTable.loyal_level_items[id] = 1;
            }
        };
        return assortTable;

}

module.exports = { mod: new AliceIllusion() };