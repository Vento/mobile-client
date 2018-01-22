import {Component} from '@angular/core';

import {NavController} from 'ionic-angular';
import {ViewUtilities} from '../../providers/view-utilities/view-utilities';
import {ProfileService} from '../../providers/profile/profile-service';
import {ProfileStorage} from '../../providers/profile/profile-storage';
import {TranslationService} from '../../providers/translation/translation-service';
import * as moment from 'moment';
import {Stepcounter} from '@ionic-native/stepcounter';


@Component({
  selector: 'page-dashboard',
  templateUrl: 'dashboard.html'
})
export class Dashboard {
  dashboard: { name?: string, lastSeen?: string, routes?: any, records?: any } = {};
  steps: number = 0;

  constructor(public navCtrl: NavController, public viewUtilities: ViewUtilities, private profileService: ProfileService,
              private profileStorage: ProfileStorage, public translationService: TranslationService, private stepcounter: Stepcounter) {
    this.subscribeSteps();
    this.getSteps();
  }


  ionViewWillEnter() {
    this.loadDashboard();
  }

  doRefresh(refresher) {
    this.loadDashboard();
    setTimeout(() => {
      refresher.complete();
    }, 2000);

  }

  private loadDashboard() {
    this.profileService.getCurrentProfile().subscribe((profileData) => {
        this.profileStorage.setProfile(profileData);
        this.dashboard.name = profileData.name;
        this.dashboard.lastSeen = this.lastLoginDuration(profileData.lastSeen);
        this.dashboard.routes = profileData.routes;
        this.dashboard.records = profileData.records;
      },
      err => {
        this.viewUtilities.onError(err);
      }
    );

    this.translationService.loadLanguagePreferences();
  }

  private lastLoginDuration(loginTime) {
    let now = moment(new Date());
    let end = moment(loginTime);
    let duration = moment.duration(now.diff(end));
    return duration.humanize();
  }

  private subscribeSteps(): void {
    let startingOffset = 0;
    this.stepcounter.start(startingOffset).then(
      onSuccess => console.log('stepcounter-start success', onSuccess),
      onFailure => console.log('stepcounter-start error', onFailure));
  }

  private getSteps(): void {
     this.stepcounter.getStepCount().then(
      onSuccess => {
        this.steps =  onSuccess;
      }
    );
  }

}
