
import { PreAkiModLoader } from "@spt-aki/loaders/PreAkiModLoader";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { IBarterScheme, ITraderAssort, ITraderBase } from "@spt-aki/models/eft/common/tables/ITrader";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { Money } from "@spt-aki/models/enums/Money";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import { IPreAkiLoadMod } from "@spt-aki/models/external/IPreAkiLoadMod";
import { IRagfairConfig } from "@spt-aki/models/spt/config/IRagfairConfig";
import { ITraderConfig, UpdateTime } from "@spt-aki/models/spt/config/ITraderConfig";
import { IDatabaseTables } from "@spt-aki/models/spt/server/IDatabaseTables";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ImageRouter } from "@spt-aki/routers/ImageRouter";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { StaticRouterModService } from "@spt-aki/services/mod/staticRouter/StaticRouterModService";
import { RagfairPriceService } from "@spt-aki/services/RagfairPriceService";
import { ImporterUtil } from "@spt-aki/utils/ImporterUtil";
import { DependencyContainer } from "tsyringe";



import { ITraderAssort, ITraderBase } from "@spt-aki/models/eft/common/tables/ITrader";




import * as baseJson from "../db/base.json";
import { Traders } from "@spt-aki/models/enums/Traders";
import * as assortJson from "../db/assort.json";
import * as path from "path";
import { LogTextColor } from "@spt-aki/models/spt/logging/LogTextColor";
import { LogBackgroundColor } from "@spt-aki/models/spt/logging/LogBackgroundColor";

const fs = require('fs');
const modPath = path.normalize(path.join(__dirname, '..'));

class AliceIllusion implements IPreAkiLoadMod, IPostDBLoadMod 
{
    private mod = "AliceIllusion";
    private logger: ILogger;
    private configServer: ConfigServer;
    private ragfairConfig: IRagfairConfig;

    constructor()
    {
        this.mod = "AliceIllusion";
    }

    public preAkiLoad(container: DependencyContainer): void 
    {
        this.logger = container.resolve<ILogger>("WinstonLogger");
        this.logger.debug(`[${this.mod}] preAki Loading...`);
        this.registerStaticRouter(container);
        Traders[baseJson._id] = baseJson._id;
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

    private setupTraderUpdateTime(traderConfig: ITraderConfig): void {
        const traderRefreshRecord: UpdateTime = { traderId: baseJson._id, seconds: { min: 1000, max: 6000 } };
        traderConfig.updateTime.push(traderRefreshRecord);
    }

    private registerProfileImage(preAkiModLoader: PreAkiModLoader, imageRouter: ImageRouter): void {
        const imageFilepath = `./${preAkiModLoader.getModPath(this.mod)}res`;
        imageRouter.addRoute(baseJson.avatar.replace(".jpg", ""), `${imageFilepath}/AliceIllusion.jpg`);
    }

    private registerStaticRouter(container: DependencyContainer): void 
    {
        const staticRouterModService: StaticRouterModService = container.resolve<StaticRouterModService>("StaticRouterModService");

        staticRouterModService.registerStaticRouter(
            "AliceIllusionUpdateLogin",
            [
                {
                    url: "/launcher/profile/login",
                    action: (url: string, info: any, sessionId: string, output: string) => 
                    {
                        const databaseServer: DatabaseServer = container.resolve<DatabaseServer>("DatabaseServer");
                        const databaseTables: IDatabaseTables = databaseServer.getTables();
                        databaseTables.traders[baseJson._id].assort = this.createAssortTable(container, sessionId);
                        return output;
                    }
                }
            ],
            "aki"
        );
        staticRouterModService.registerStaticRouter(
            "AliceIllusionUpdate",
            [
                {
                    url: "/client/game/profile/items/moving",
                    action: (url: string, info: any, sessionId: string, output: string) => 
                    {
                        if (info.data[0].Action != "Examine") 
                        {
                            const databaseServer: DatabaseServer = container.resolve<DatabaseServer>("DatabaseServer");
                            const databaseTables: IDatabaseTables = databaseServer.getTables();
                            databaseTables.traders[baseJson._id].assort = this.createAssortTable(container, sessionId);
                        }
                        return output;
                    }
                }
            ],
            "aki"
        );
    }

    private addSingleItemToAssortWithBarterScheme(assortTable: ITraderAssort, itemTpl: string, unlimitedCount: boolean, stackCount: number, loyaltyLevel: number, barterSchemes: IBarterScheme[][]): void 
    {
        const newItem: Item = {
            _id: itemTpl,
            _tpl: itemTpl,
            parentId: "hideout",
            slotId: "hideout",
            upd: {
                UnlimitedCount: unlimitedCount,
                StackObjectsCount: stackCount
            }
        };
        assortTable.items.push(newItem);

        assortTable.barter_scheme[itemTpl] = barterSchemes;

        if (loyaltyLevel) 
        {
            assortTable.loyal_level_items[itemTpl] = loyaltyLevel;
        }
    }

    private addSingleItemToAssort(assortTable: ITraderAssort, itemTpl: string, unlimitedCount: boolean, stackCount: number, loyaltyLevel: number, currencyType: Money | string, currencyValue: number): void 
    {
        this.addSingleItemToAssortWithBarterScheme(assortTable, itemTpl, unlimitedCount, stackCount, loyaltyLevel, [
            [
                {
                    count: currencyValue,
                    _tpl: currencyType
                }
            ]
        ]);
    }

    private addCollectionToAssort(assortTable: ITraderAssort, items: Item[], unlimitedCount: boolean, stackCount: number, loyaltyLevel: number, currencyType: Money | string, currencyValue: number): void 
    {
        const collectionToAdd: Item[] = JSON.parse(JSON.stringify(items));

        collectionToAdd[0].upd = {
            UnlimitedCount: unlimitedCount,
            StackObjectsCount: stackCount
        };
        collectionToAdd[0].parentId = "hideout";
        collectionToAdd[0].slotId = "hideout";

        assortTable.items.push(...collectionToAdd);

        assortTable.barter_scheme[collectionToAdd[0]._id] = [
            [
                {
                    _tpl: currencyType,
                    count: currencyValue
                    
                }
            ]
        ];
        
        assortTable.loyal_level_items[collectionToAdd[0]._id] = loyaltyLevel;
    }
    private getPresets(container: DependencyContainer, assortTable, currency, profiles) {
        const jsonUtil = container.resolve<JsonUtil>("JsonUtil");
        const RagfairPriceService = container.resolve<RagfairPriceService>("RagfairPriceService");
        let pool = [];
        for (let p in (profiles || [])) {
            for (let wbk in profiles[p].userbuilds.weaponBuilds) {
                let wb = profiles[p].userbuilds.weaponBuilds[wbk];
                let preItems = wb.Items;
                let id = preItems[0]._id;
                let tpl = preItems[0]._tpl;
                if (pool.includes(id)) {
                    continue;
                }
                pool.push(id)
                preItems[0] = {
                    "_id": id,
                    "_tpl": tpl,
                    "upd": {
                        "Repairable": {
                            "MaxDurability": 100,
                            "Durability": 100
                        },
                        "FireMode": {
                            "FireMode": "single"
                        }
                    }
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
                        "_tpl": currency,
                        "count": price
                    }
                ];
                assortTable.barter_scheme[id] = [offerRequire];
                assortTable.loyal_level_items[id] = 1;
            }
        };
        return assortTable;
    }
    
    private createAssortTable(container: DependencyContainer, sessionId?: string): ITraderAssort 
    {
            const importer = container.resolve("ImporterUtil");
            let assortTable: ITraderAssort = {
                nextResupply: 0,
                items: [],
                barter_scheme: {},
                loyal_level_items: {},
            }
            let currency = "5696686a4bdc2da3298b456a"
            let config;
            try {
                config = require(`../config/config.json`);
            } catch (e) {
            }
    
            let profiles = {};
            if (sessionId) {
                let t = container.resolve("ProfileHelper").getFullProfile(sessionId)
                profiles = { [sessionId]: t };
            } else {
                profiles = importer.loadRecursive('user/profiles/');
            }
            try {
                assortTable = this.getPresets(container, assortTable, (config || {}).currency || currency, profiles);
                console.log(assortTable)
            } catch (error) {
                console.error(error);
            };    
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

    
    
    
    private addHandbookToDb(container: DependencyContainer) 
    {
        const databaseServer: DatabaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        const databaseTables: IDatabaseTables = databaseServer.getTables();

        for (const handbook of this.mydb.templates.handbook.Items) 
        {
            if (!databaseTables.templates.handbook.Items.find((i) => i.Id == handbook.Id)) databaseTables.templates.handbook.Items.push(handbook);
        }
    }

}
module.exports = { mod: new AliceIllusion() };