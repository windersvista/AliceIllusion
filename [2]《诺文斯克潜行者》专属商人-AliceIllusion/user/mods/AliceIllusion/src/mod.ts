/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/brace-style */

/*
* If you are reading this, I hope you are enjoying AI
* 
* 
* I have worked on this mod for several months and have tried my best to make it as easy to read and clean as possible
* I may not always do things in the best way, but I do try!
* If you have any questions please reach out to me in the SPT Discord - do not DM me
*  
*/

import { DependencyContainer, container } from "tsyringe";

// SPT types
import { IPreAkiLoadMod } from "@spt-aki/models/external/IPreAkiLoadMod";
import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { PreAkiModLoader } from "@spt-aki/loaders/PreAkiModLoader";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { ImageRouter } from "@spt-aki/routers/ImageRouter";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { ITraderConfig } from "@spt-aki/models/spt/config/ITraderConfig";
import { IRagfairConfig } from "@spt-aki/models/spt/config/IRagfairConfig";
import type {DynamicRouterModService} from "@spt-aki/services/mod/dynamicRouter/DynamicRouterModService";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";

// JSON Imports
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { VFS } from "@spt-aki/utils/VFS";
import { jsonc } from "jsonc";
import fs from "node:fs";
import path from "node:path";


// Custom Imports
import { TraderHelper } from "./traderHelpers";
import { FluentAssortConstructor as FluentAssortCreator } from "./fluentTraderAssortCreator";
import { Traders } from "@spt-aki/models/enums/Traders";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import baseJson = require("../db/base.json");
import questJson = require("../db/questassort.json");
import assortJson = require("../db/assort.json");
import productionJson = require("../db/production.json");
import weaponCompatibility = require("../config/ModdedWeaponCompatibility.json");

let realismDetected: boolean;
const loadMessage = {
    0: "Who is AliceIllusion?"
}

class AliceIllusion implements IPreAkiLoadMod, IPostDBLoadMod
{
    private mod: string
    private logger: ILogger
    private traderHelper: TraderHelper
    private fluentAssortCreator: FluentAssortCreator    

    private static vfs = container.resolve<VFS>("VFS");    
    private static config: Config = jsonc.parse(AliceIllusion.vfs.readFile(path.resolve(__dirname, "../config/config.jsonc")));

    // Set the name of mod for logging purposes
    constructor() 
    {
        this.mod = "AliceIllusion"; 
    }

    /*
     * Some work needs to be done prior to SPT code being loaded
     * 
     * TLDR:
     * Resolve SPT Types
     * Set trader refresh, config, image, flea settings
     * Register Dynamic Router for Randomization Config
     * 
     */
    public preAkiLoad(container: DependencyContainer): void
    {
        // Get a logger
        this.logger = container.resolve<ILogger>("WinstonLogger");

        // Get SPT code/data we need later
        const dynamicRouterModService = container.resolve<DynamicRouterModService>("DynamicRouterModService");     
        const preAkiModLoader: PreAkiModLoader = container.resolve<PreAkiModLoader>("PreAkiModLoader");   
        const databaseServer: DatabaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        const imageRouter: ImageRouter = container.resolve<ImageRouter>("ImageRouter");
        const configServer = container.resolve<ConfigServer>("ConfigServer");
        const hashUtil: HashUtil = container.resolve<HashUtil>("HashUtil");
        const traderConfig: ITraderConfig = configServer.getConfig<ITraderConfig>(ConfigTypes.TRADER);
        const ragfairConfig = configServer.getConfig<IRagfairConfig>(ConfigTypes.RAGFAIR);
        
        // Set config values to local variables for validation & use
        let minRefresh = AliceIllusion.config.traderRefreshMin;
        let maxRefresh = AliceIllusion.config.traderRefreshMax;
        const addToFlea = AliceIllusion.config.addTraderToFlea;
        if (minRefresh >= maxRefresh || maxRefresh <= 2)
        {
            minRefresh = 1800;
            maxRefresh = 3600;
            this.logger.error(`[${this.mod}] [Config Issue] Refresh timers have been reset to default.`);
        }
        
        // Create helper class and use it to register our traders image/icon + set its stock refresh time
        this.traderHelper = new TraderHelper();
        this.fluentAssortCreator = new FluentAssortCreator(hashUtil, this.logger);
        this.traderHelper.registerProfileImage(baseJson, this.mod, preAkiModLoader, imageRouter, "AliceIllusion.jpg");
        this.traderHelper.setTraderUpdateTime(traderConfig, baseJson, minRefresh, maxRefresh);

        // Add trader to trader enum
        Traders[baseJson._id] = baseJson._id;

        // Add trader to flea market
        if (addToFlea)
        {
            ragfairConfig.traders[baseJson._id] = true;
        }
        else
        {
            ragfairConfig.traders[baseJson._id] = false;
        }

        dynamicRouterModService.registerDynamicRouter(
            "AliceIllusionRefreshStock",
            [
                {
                    url: "/client/items/prices/AliceIllusion",
                    action: (url, info, sessionId, output) => 
                    {
                        const trader = databaseServer.getTables().traders.AliceIllusion;
                        const assortItems = trader.assort.items;
                        if (!realismDetected)
                        {
                            if (AliceIllusion.config.randomizeBuyRestriction)
                            {
                                if (AliceIllusion.config.debugLogging) {this.logger.info(`[${this.mod}] Refreshing AliceIllusion Stock with Randomized Buy Restrictions.`);}
                                this.randomizeBuyRestriction(assortItems);
                            }
                            if (AliceIllusion.config.randomizeStockAvailable)
                            {
                                if (AliceIllusion.config.debugLogging) {this.logger.info(`[${this.mod}] Refreshing AliceIllusion Stock with Randomized Stock Availability.`);}
                                this.randomizeStockAvailable(assortItems);
                            }
                        }
                        return output;
                    }
                }
            ],
            "aki"
        );
    }
    /*
     * Some work needs to be done after loading SPT code
     * 
     * TLDR:
     * Resolve SPT Types
     * Add Modded Weapons to Quests
     * Mod Detection to enable/disable Assort Configuration options
     * Apply Assort Configurations
     * Add trader to dictionary, locales, and assort
     * 
     */
    public postDBLoad(container: DependencyContainer): void
    {
        const start = performance.now();

        // Resolve SPT classes we'll use
        const databaseServer: DatabaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        const jsonUtil: JsonUtil = container.resolve<JsonUtil>("JsonUtil");
        const logger = container.resolve<ILogger>("WinstonLogger");

        //Set local variables for assortJson
        const assortPriceTable = assortJson.barter_scheme;
        const assortItemTable = assortJson.items;
        const assortLoyaltyTable = assortJson.loyal_level_items;
        
        //Run Modded Weapon Compatibility
        this.moddedWeaponCompatibility();

        //Check Mod Compatibility
        this.modDetection();

        //Push Production Schemes
        this.pushProductionUnlocks();

        //Update Assort
        if (AliceIllusion.config.priceMultiplier !== 1){this.setPriceMultiplier(assortPriceTable);}
        if (AliceIllusion.config.randomizeBuyRestriction){this.randomizeBuyRestriction(assortItemTable);}
        if (AliceIllusion.config.randomizeStockAvailable){this.randomizeStockAvailable(assortItemTable);}
        if (AliceIllusion.config.unlimitedStock){this.setUnlimitedStock(assortItemTable);}
        if (AliceIllusion.config.unlimitedBuyRestriction){this.setUnlimitedBuyRestriction(assortItemTable);}
        if (AliceIllusion.config.removeLoyaltyRestriction){this.disableLoyaltyRestrictions(assortLoyaltyTable);}

        // Set local variable for assort to pass to traderHelper regardless of priceMultiplier config
        const newAssort = assortJson

        // Get a reference to the database tables
        const tables = databaseServer.getTables();

        // Add new trader to the trader dictionary in DatabaseServer       
        // Add quest assort
        // Add trader to locale file, ensures trader text shows properly on screen
        this.traderHelper.addTraderToDb(baseJson, tables, jsonUtil, newAssort);
        tables.traders[baseJson._id].questassort = questJson;
        this.traderHelper.addTraderToLocales(baseJson, tables, baseJson.name, "AliceIllusion", baseJson.nickname, baseJson.location, "I'm sellin', what are you buyin'?");

        this.logger.debug(`[${this.mod}] loaded... `);

        const timeTaken = performance.now() - start;
        if (AliceIllusion.config.debugLogging) {logger.log(`[${this.mod}] Trader load took ${timeTaken.toFixed(3)}ms.`, "cyan");}

        logger.log(`[${this.mod}] ${this.getRandomLoadMessage()}`, "cyan");
    }

    /*
     * 
     * All functions are below this comment
     * 
     * Most of these functions should be self explanatory
     * 
     */
    private setRealismDetection(i: boolean) // Except this one. This is dumb. I'll fix it eventually.
    {
        realismDetected = i;
        if (realismDetected && AliceIllusion.config.randomizeBuyRestriction || realismDetected && AliceIllusion.config.randomizeStockAvailable)
        {
            this.logger.log(`[${this.mod}] SPT-Realism detected, disabling randomizeBuyRestriction and/or randomizeStockAvailable:`, "cyan");
        }
    }

    private setPriceMultiplier (assortPriceTable)
    {
        let priceMultiplier = AliceIllusion.config.priceMultiplier;
        if (priceMultiplier <= 0) 
        {
            priceMultiplier = 1;
            this.logger.error(`[${this.mod}] priceMultiplier cannot be set to zero.`)
        }
        for (const itemID in assortPriceTable)
        {
            for (const item of assortPriceTable[itemID])
            {
                if (item[0].count <= 15)
                {
                    if (AliceIllusion.config.debugLogging) {this.logger.log(`[${this.mod}] itemID: [${itemID}] No price change, it's a barter trade.`, "cyan");}
                    continue;
                }
                const count = item[0].count;
                const newPrice = Math.round(count * priceMultiplier);
                item[0].count = newPrice
                if (AliceIllusion.config.debugLogging) {this.logger.log(`[${this.mod}] itemID: [${itemID}] Price Changed to: [${newPrice}]`, "cyan");}
            }
        } 
    }

    private randomizeBuyRestriction(assortItemTable)
    {
        const randomUtil: RandomUtil = container.resolve<RandomUtil>("RandomUtil");
        if (!realismDetected) // If realism is not detected, continue, else do nothing
        {
            for (const item in assortItemTable)
            {
                if (assortItemTable[item].parentId !== "hideout")
                {
                    continue // Skip setting count, it's a weapon attachment or armour plate
                }
                const itemID = assortItemTable[item]._id;
                const oldRestriction = assortItemTable[item].upd.BuyRestrictionMax;
                const newRestriction = Math.round(randomUtil.randInt((oldRestriction * 0.5), oldRestriction));
                
                assortItemTable[item].upd.BuyRestrictionMax = newRestriction;
    
                if (AliceIllusion.config.debugLogging) {this.logger.log(`[${this.mod}] Item: [${itemID}] Buy Restriction Changed to: [${newRestriction}]`, "cyan");}
            }
        }
    }

    private randomizeStockAvailable(assortItemTable)
    {
        const randomUtil: RandomUtil = container.resolve<RandomUtil>("RandomUtil");
        if (!realismDetected) // If realism is not detected, continue, else do nothing
        {
            for (const item in assortItemTable)
            {
                if (assortItemTable[item].parentId !== "hideout")
                {
                    continue // Skip setting count, it's a weapon attachment or armour plate
                }
                const outOfStockRoll = randomUtil.getChance100(AliceIllusion.config.outOfStockChance);
                
                if (outOfStockRoll)
                {
                    const itemID = assortItemTable[item]._id;
                    assortItemTable[item].upd.StackObjectsCount = 0;

                    if (AliceIllusion.config.debugLogging) {this.logger.log(`[${this.mod}] Item: [${itemID}] Marked out of stock`, "cyan");}
                } 
                else
                {
                    const itemID = assortItemTable[item]._id;
                    const originalStock = assortItemTable[item].upd.StackObjectsCount;
                    const newStock = randomUtil.randInt(2, (originalStock*0.5));
                    assortItemTable[item].upd.StackObjectsCount = newStock;

                    if (AliceIllusion.config.debugLogging) {this.logger.log(`[${this.mod}] Item: [${itemID}] Stock Count changed to: [${newStock}]`, "cyan");}
                }
            }
        }
    }

    private setUnlimitedStock(assortItemTable)
    {
        for (const item in assortItemTable)
        {
            if (assortItemTable[item].parentId !== "hideout")
            {
                continue // Skip setting count, it's a weapon attachment or armour plate
            }
            assortItemTable[item].upd.StackObjectsCount = 9999999;
            assortItemTable[item].upd.UnlimitedCount = true;
        }
        if (AliceIllusion.config.debugLogging) {this.logger.log(`[${this.mod}] Item stock counts are now unlimited`, "cyan");}
    }

    private setUnlimitedBuyRestriction(assortItemTable)
    {
        for (const item in assortItemTable)
        {
            if (assortItemTable[item].parentId !== "hideout")
            {
                continue // Skip setting count, it's a weapon attachment or armour plate
            }
            delete assortItemTable[item].upd.BuyRestrictionMax;
            delete assortItemTable[item].upd.BuyRestrictionCurrent;
        }
        if (AliceIllusion.config.debugLogging) {this.logger.log(`[${this.mod}] Item buy restrictions are now unlimited`, "cyan");}
    }

    private disableLoyaltyRestrictions(assortLoyaltyTable)
    {
        for (const item in assortLoyaltyTable)
        {
            delete assortLoyaltyTable[item];
        }
        if (AliceIllusion.config.debugLogging) {this.logger.log(`[${this.mod}] All Loyalty Level requirements are removed`, "cyan");}
    }

    private modDetection()
    {
        const preAkiModLoader: PreAkiModLoader = container.resolve<PreAkiModLoader>("PreAkiModLoader");
        const vcqlCheck = preAkiModLoader.getImportedModsNames().includes("Virtual's Custom Quest Loader");
        const realismCheck = preAkiModLoader.getImportedModsNames().includes("SPT-Realism");
        const vcqlDllPath = path.resolve(__dirname, "../../../../BepInEx/plugins/VCQLQuestZones.dll");
        const heliCrashSamSWAT = path.resolve(__dirname, "../../../../BepInEx/plugins/SamSWAT.HeliCrash/SamSWAT.HeliCrash.dll");
        const heliCrashTyrian = path.resolve(__dirname, "../../../../BepInEx/plugins/SamSWAT.HeliCrash.TyrianReboot/SamSWAT.HeliCrash.TyrianReboot.dll");
        const heliCrashArys = path.resolve(__dirname, "../../../../BepInEx/plugins/SamSWAT.HeliCrash.ArysReloaded/SamSWAT.HeliCrash.ArysReloaded.dll");
        
        // VCQL Zones DLL is missing
        if (!fs.existsSync(vcqlDllPath))
        {
            this.logger.error(`[${this.mod}] VCQL Zones DLL missing. Custom Trader quests may not work properly.`);
        }

        // Outdated HeliCrash is installed
        if (fs.existsSync(heliCrashSamSWAT) || fs.existsSync(heliCrashTyrian))
        {
            this.logger.error(`[${this.mod}] Outdated HeliCrash Mod Detected. You will experience issues with Custom Trader quest zones.`);
        }

        // Arys HeliCrash is installed
        if (fs.existsSync(heliCrashArys))
        {
            this.logger.warning(`[${this.mod}] HeliCrash Mod Detected. You may experience issues with Custom Trader quest zones.`);
        }

        // VCQL package.json is missing
        if (!vcqlCheck)
        {
            this.logger.error(`[${this.mod}] VCQL not detected. Install VCQL and re-install ${this.mod}.`);
        }

        // This is completely unneccessary and I'll fix it, eventually - probably
        if (AliceIllusion.config.randomizeBuyRestriction || AliceIllusion.config.randomizeStockAvailable)
        {
            this.setRealismDetection(realismCheck);
        }
        else
        {
            this.setRealismDetection(realismCheck);
        }
    }

    private moddedWeaponCompatibility()
    {
        const databaseServer: DatabaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        const questTable = databaseServer.getTables().templates.quests;
        const quests = Object.values(questTable);

        let questType;
        let weaponType;
        let wasAdded:boolean;

        if (weaponCompatibility.AssaultRifles.length >= 1)
        {
            weaponType = weaponCompatibility.AssaultRifles;
            questType = quests.filter(x => x._id.includes("AliceIllusion_10_1_"));
            wasAdded = true;
            this.moddedWeaponPushToArray(questType, weaponType);
        }
        if (weaponCompatibility.SubmachineGuns.length >= 1)
        {
            weaponType = weaponCompatibility.SubmachineGuns;
            questType = quests.filter(x => x._id.includes("AliceIllusion_10_2_"));
            wasAdded = true;
            this.moddedWeaponPushToArray(questType, weaponType);
        }
        if (weaponCompatibility.Snipers.length >= 1)
        {
            weaponType = weaponCompatibility.Snipers;
            questType = quests.filter(x => x._id.includes("AliceIllusion_10_3_"));
            wasAdded = true;
            this.moddedWeaponPushToArray(questType, weaponType);
        }
        if (weaponCompatibility.Marksman.length >= 1)
        {
            weaponType = weaponCompatibility.Marksman;
            questType = quests.filter(x => x._id.includes("AliceIllusion_10_4_"));
            wasAdded = true;
            this.moddedWeaponPushToArray(questType, weaponType);
        }
        if (weaponCompatibility.Shotguns.length >= 1)
        {
            weaponType = weaponCompatibility.Shotguns;
            questType = quests.filter(x => x._id.includes("AliceIllusion_10_5_"));
            wasAdded = true;
            this.moddedWeaponPushToArray(questType, weaponType);
        }
        if (weaponCompatibility.Pistols.length >= 1)
        {
            weaponType = weaponCompatibility.Pistols;
            questType = quests.filter(x => x._id.includes("AliceIllusion_10_6_"));
            wasAdded = true;
            this.moddedWeaponPushToArray(questType, weaponType);
        }
        if (weaponCompatibility.LargeMachineGuns.length >= 1)
        {
            weaponType = weaponCompatibility.LargeMachineGuns;
            questType = quests.filter(x => x._id.includes("AliceIllusion_10_7_"));
            wasAdded = true;
            this.moddedWeaponPushToArray(questType, weaponType);
        }
        if (weaponCompatibility.Carbines.length >= 1)
        {
            weaponType = weaponCompatibility.Carbines;
            questType = quests.filter(x => x._id.includes("AliceIllusion_10_8_"));
            wasAdded = true;
            this.moddedWeaponPushToArray(questType, weaponType);
        }
        if (weaponCompatibility.Melee.length >= 1)
        {
            weaponType = weaponCompatibility.Melee;
            questType = quests.filter(x => x._id.includes("AliceIllusion_10_9_"));
            wasAdded = true;
            this.moddedWeaponPushToArray(questType, weaponType);
        }
        if (weaponCompatibility.Explosives.length >= 1)
        {
            weaponType = weaponCompatibility.Explosives;
            questType = quests.filter(x => x._id.includes("AliceIllusion_10_10_"));
            wasAdded = true;
            this.moddedWeaponPushToArray(questType, weaponType);
        }
        if (wasAdded) { this.logger.log(`[${this.mod}] Custom Weapons added to proficiency quests. Enjoy!`, "cyan"); }
    }
    
    private moddedWeaponPushToArray(questType, weaponType)
    {        
        for (const quest in questType)
        {
            for (const condition in questType[quest].conditions.AvailableForFinish)
            {
                for (const item in questType[quest].conditions.AvailableForFinish[condition].counter.conditions)
                {
                    for (const id of weaponType)
                    {
                        questType[quest].conditions.AvailableForFinish[condition].counter.conditions[item].weapon.push(id);
                    }
                }
            }
            if (AliceIllusion.config.debugLogging) { this.logger.log(`[${this.mod}] ${questType[quest].QuestName} --- Added ${weaponType}`, "cyan"); }
        }
    }

    private pushProductionUnlocks() {
        const databaseServer: DatabaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        const productionTable = databaseServer.getTables().hideout.production;

        for (const item of productionJson)
        {
            productionTable.push(item);
        }
    }

    private getRandomLoadMessage()
    {
        const value = loadMessage[Math.floor(Math.random() * Object.keys(loadMessage).length)];
        return value;
    }
}

/*
* 
* This is the interface for the config to validate the values
* 
*/
interface Config 
{
    randomizeStockAvailable: boolean,
    outOfStockChance: number,
    randomizeBuyRestriction: boolean,
    priceMultiplier: number,
    unlimitedStock: boolean,
    unlimitedBuyRestriction: boolean,
    removeLoyaltyRestriction: boolean,
    traderRefreshMin: number,
    traderRefreshMax: number,
    addTraderToFlea: boolean,
    debugLogging: boolean,
}

module.exports = { mod: new AliceIllusion() }