import { makeAutoObservable } from 'mobx';

import { SettingsTabValue } from '@weblab/models';

import { HotkeyStore } from '@/components/store/hotkeys';

export class StateManager {
    isSubscriptionModalOpen = false;
    isSettingsModalOpen = false;
    settingsTab: SettingsTabValue | string = SettingsTabValue.SITE;
    hotkeys = new HotkeyStore();

    constructor() {
        makeAutoObservable(this);
    }

    // Explicit action setters so callers don't trigger MobX strict-mode
    // "modified outside action" warnings via raw property writes. Methods on
    // a `makeAutoObservable` class are auto-wrapped as actions; direct field
    // assignment from outside the class is not.
    setIsSubscriptionModalOpen(open: boolean) {
        this.isSubscriptionModalOpen = open;
    }

    setIsSettingsModalOpen(open: boolean) {
        this.isSettingsModalOpen = open;
    }

    setSettingsTab(tab: SettingsTabValue | string) {
        this.settingsTab = tab;
    }
}
