/// <reference path='../../ref/VSS/VSS.d.ts' />

import Calendar_Contracts = require("Calendar/Contracts");
import Calendar_DateUtils = require("Calendar/Utils/Date");
import Calendar_ColorUtils = require("Calendar/Utils/Color");
import Contracts_Platform = require("VSS/Common/Contracts/Platform");
import Contributions_Contracts = require("VSS/Contributions/Contracts");
import Contributions_RestClient = require("VSS/Contributions/RestClient");
import Q = require("q");
import Service = require("VSS/Service");
import WebApi_Constants = require("VSS/WebApi/Constants");
import Utils_Core = require("VSS/Utils/Core");

export class FreeFormEventsSource implements Calendar_Contracts.IEventSource {

    public id = "freeForm";
    public name = "Events";
    public order = 10;

    private _teamId: string;
    private _events: Calendar_Contracts.CalendarEvent[];

    constructor() {
        var webContext = VSS.getWebContext();
        this._teamId = webContext.team.id;
    }

    public getEvents(query?: Calendar_Contracts.IEventQuery): IPromise<Calendar_Contracts.CalendarEvent[]> {
        return this._beginGetAppSetting();
    }

    public getCategories(query?: Calendar_Contracts.IEventQuery): IPromise<Calendar_Contracts.IEventCategory[]> {
        return this.getEvents().then(
            (events: Calendar_Contracts.CalendarEvent[]) => {
                return this._categorizeEvents(events, query);
            });
    }

    public addEvents(events: Calendar_Contracts.CalendarEvent[]): IPromise<Calendar_Contracts.CalendarEvent[]> {
        var deferred = Q.defer();
        this._beginGetAppSetting().then(() => {
            events.forEach((calendarEvent: Calendar_Contracts.CalendarEvent, index: number, array: Calendar_Contracts.CalendarEvent[]) => {
                this._events.push(calendarEvent);
            });
            this._beginUpdateAppSetting().then(deferred.resolve, deferred.reject);

        });
        return deferred.promise;
    }

    public removeEvents(events: Calendar_Contracts.CalendarEvent[]): IPromise<Calendar_Contracts.CalendarEvent[]> {
        var deferred = Q.defer();
        this._beginGetAppSetting().then(() => {
            events.forEach((calendarEvent: Calendar_Contracts.CalendarEvent, index: number, array: Calendar_Contracts.CalendarEvent[]) => {
                var eventInArray: Calendar_Contracts.CalendarEvent = $.grep(this._events, function (e) { return e.eventId === calendarEvent.eventId; })[0]; //better check here
                var index = this._events.indexOf(eventInArray);
                if (index > -1) {
                    this._events.splice(index, 1);
                }
            });
            this._beginUpdateAppSetting().then(deferred.resolve, deferred.reject);

        });
        return deferred.promise;
    }

    public updateEvents(events: Calendar_Contracts.CalendarEvent[]): IPromise<Calendar_Contracts.CalendarEvent[]> {
        var deferred = Q.defer();
        this._beginGetAppSetting().then(() => {
            events.forEach((calendarEvent: Calendar_Contracts.CalendarEvent, index: number, array: Calendar_Contracts.CalendarEvent[]) => {
                var eventInArray: Calendar_Contracts.CalendarEvent = $.grep(this._events, function (e) { return e.eventId === calendarEvent.eventId; })[0]; //better check here
                var index = this._events.indexOf(eventInArray);
                if (index > -1) {
                    this._events.splice(index, 1, calendarEvent);
                }
            });
            this._beginUpdateAppSetting().then(deferred.resolve, deferred.reject);

        });
        return deferred.promise;
    }

    private _beginGetAppSetting(): IPromise<Calendar_Contracts.CalendarEvent[]> {
        var deferred = Q.defer<Calendar_Contracts.CalendarEvent[]>();
        var contributionsClient: Contributions_RestClient.ContributionsHttpClient = Service.VssConnection
            .getConnection(null, Contracts_Platform.ContextHostType.Application)
            .getHttpClient(Contributions_RestClient.ContributionsHttpClient, WebApi_Constants.ServiceInstanceTypes.TFS);

        contributionsClient.getAppData(VSS.getExtensionContext().id, this._teamId).then(
            (appSetting: Contributions_Contracts.AppSetting) => {
                this._events = this._appSettingToEvents(appSetting.value);
                deferred.resolve(this._events);
            },
            (e: Error) => {
                deferred.reject(e);
            });

        return deferred.promise;
    }

    private _beginUpdateAppSetting(): IPromise<Calendar_Contracts.CalendarEvent[]> {
        var deferred = Q.defer();
        var appSetting = this._eventsToAppSetting();

        var contributionsClient = Service.VssConnection
            .getConnection(null, Contracts_Platform.ContextHostType.Application)
            .getHttpClient(Contributions_RestClient.ContributionsHttpClient, WebApi_Constants.ServiceInstanceTypes.TFS);

        contributionsClient.updateAppData(appSetting, VSS.getExtensionContext().id, this._teamId).then(
            (appSetting: Contributions_Contracts.AppSetting) => {
                this._events = this._appSettingToEvents(appSetting.value);
                deferred.resolve(this._events);
            },
            (e: Error) => {
                deferred.reject(e);
            });

        return deferred.promise;
    }

    private _eventsToAppSetting(): Contributions_Contracts.AppSetting {
        var appSettingValue = JSON.stringify({
            'events': this._events
        });
        var appSetting: Contributions_Contracts.AppSetting = {
            'key': this._teamId,
            'value': appSettingValue
        };
        return appSetting;
    }

    private _appSettingToEvents(appSettingValue: string): Calendar_Contracts.CalendarEvent[] {
        if (appSettingValue) {
            var json = JSON.parse(appSettingValue);
            return json.events ? json.events : [];
        }
        return [];
    }

    private _categorizeEvents(events: Calendar_Contracts.CalendarEvent[], query?: Calendar_Contracts.IEventQuery): Calendar_Contracts.IEventCategory[] {
        var categories: Calendar_Contracts.IEventCategory[] = [];
        var categoryMap: { [name: string]: Calendar_Contracts.IEventCategory } = {};
        var countMap: { [name: string]: number } = {};
        $.each(events || [],(index: number, event: Calendar_Contracts.CalendarEvent) => {
            var name = (event.category || "uncategorized").toLocaleLowerCase();
            if (Calendar_DateUtils.eventIn(event, query)) {
                var count = 0;
                if (!categoryMap[name]) {
                    categoryMap[name] = {
                        title: name,
                        subTitle: "",
                        color: Calendar_ColorUtils.generateColor(name)
                    };

                    categories.push(categoryMap[name]);
                    countMap[name] = 0;
                }

                // Update sub title with the count
                count = countMap[name] + 1;
                if (count === 1) {
                    categoryMap[name].subTitle = event.title;
                }
                else {
                    categoryMap[name].subTitle = Utils_Core.StringUtils.format("{0} event{1}", count, count > 1 ? "s" : "");
                }
                countMap[name] = count;
            }
        });

        return categories;
    }
}