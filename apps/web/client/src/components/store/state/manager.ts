import { SettingsTabValue } from '@weblab/models';
import { makeAutoObservable } from 'mobx';

import { HotkeyStore } from '@/components/store/hotkeys';

export class StateManager {
    isSubscriptionModalOpen = false;
    isSettingsModalOpen = false;
    settingsTab: SettingsTabValue | string = SettingsTabValue.SITE;
    hotkeys = new HotkeyStore();

    constructor() {
        makeAutoObservable(this);
    }
}