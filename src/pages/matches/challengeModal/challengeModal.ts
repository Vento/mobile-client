import {Component, ElementRef, ViewChild} from '@angular/core';
import {NavController, NavParams, Platform, ViewController} from 'ionic-angular';
import {GoogleMapsProvider} from "../../../providers/google-maps/google-maps";
import {ViewUtilities} from "../../../providers/view-utilities/view-utilities";
import {AgmMap, GoogleMapsAPIWrapper, LatLngLiteral} from "@agm/core";
import {Http} from '@angular/http';
import {ProfileService} from "../../../providers/profile/profile-service";
import {IProfile} from "../../../models/ProfileModel";
import {StompService} from "../../../providers/@stomp/ng2-stompjs/src/stomp.service";
import {ProfileStorage} from "../../../providers/profile/profile-storage";
import * as _ from "lodash";
import {IUserLocation} from "../MatchesModel";

@Component({
  selector: 'modal-challenge',
  templateUrl: 'challengeModal.html'
})
export class ChallengeModal {

  @ViewChild(AgmMap) mapElement: AgmMap;
  @ViewChild('pleaseConnect') pleaseConnect: ElementRef;
  private drawingManager: any;
  private paths: Array<LatLngLiteral> = [];
  private map: GoogleMapsAPIWrapper;
  private placeIdArray = [];
  private snappedCoordinates = [];
  private user: any;
  private request: any;
  private currentUser: IProfile;
  private isRequestSent: boolean = false;
  private isRequestAccepted: boolean = false;
  private markers: any = [];

  constructor(public navCtrl: NavController, public navParams: NavParams,
              public viewUtilities: ViewUtilities, public platform: Platform,
              public googleMapsProvider: GoogleMapsProvider, public viewCtrl: ViewController,
              public http: Http, public profileService: ProfileService,
              public profileStorage: ProfileStorage, private _stompService: StompService) {

    this.user = navParams.get('user');
    this.request = navParams.get('request');
    this.profileStorage.getProfile().then((profile: IProfile) => {
      this.currentUser = profile;
    });

    if (this.user) {
      this.profileService.getProfile(this.user.label).subscribe((profile: IProfile) => {
          console.log(profile)
          this.acceptSubscription();
        },
        err => {
          this.viewUtilities.onError(err);
        }
      );
    } else if (this.request) {
      let points: any[] = [];
      this.request.route.points.forEach((point) => {
        point = this.renameKeyName(point, "x", "lat");
        point = this.renameKeyName(point, "y", "lng");
        points.push(point);
      });
      this.paths = points;

      if(this.request.route.accepted) {
        this.handleAcceptConfirmation(this.request);
      }
    }
  }


  public ionViewDidLoad(): void {
    this.platform.ready().then(() => {
      this.googleMapsProvider.init(this.mapElement, this.pleaseConnect.nativeElement);
    });

  }

  public loadAPIWrapper(map) {
    this.map = map;
    this.drawingManager = new google.maps.drawing.DrawingManager({
      drawingMode: google.maps.drawing.OverlayType.POLYLINE,
      drawingControl: true,
      drawingControlOptions: {
        position: google.maps.ControlPosition.TOP_CENTER,
        drawingModes: [
          google.maps.drawing.OverlayType.POLYLINE
        ]
      },
      polylineOptions: {
        strokeColor: '#000000',
        strokeWeight: 3
      }
    });
    this.drawingManager.setMap(this.map);

    this.drawingManager.addListener('polylinecomplete', (poly) => {
      let path = poly.getPath();
      poly.setMap(null);
      this.placeIdArray = [];
      this.runSnapToRoad(path);
    });
  }

  private runSnapToRoad(path) {
    this.paths = [];
    let pathValues = [];
    for (let i = 0; i < path.getLength(); i++) {
      pathValues.push(path.getAt(i).toUrlValue());
    }

    this.http.get('https://roads.googleapis.com/v1/snapToRoads?path=' + pathValues.join('|') + '&interpolate=true&key=AIzaSyAc1FP_Vf1BCmuCqo47pM5HUcrA9kiVcrI')
      .subscribe((res => {
        this.processSnapToRoadResponse(res.json());
      }));
  }

  private processSnapToRoadResponse(data) {
    this.snappedCoordinates = [];
    this.placeIdArray = [];
    for (let i = 0; i < data.snappedPoints.length; i++) {
      let polyline: any = {};
      polyline.lat = data.snappedPoints[i].location.latitude;
      polyline.lng = data.snappedPoints[i].location.longitude;
      this.paths.push(polyline);
    }
    this.mapElement.triggerResize().then(() => {
      let center = {
        lat: data.snappedPoints[data.snappedPoints.length - 1].location.latitude,
        lng: data.snappedPoints[0].location.longitude
      };
      this.map.setCenter(center);
      this.map.panTo(center);
      if (data.warningMessage) {
        this.viewUtilities.presentToast(data.warningMessage);
      }
    });
  }

  private dismiss() {
    this.viewCtrl.dismiss();
  }

  private calculateKmDistance(points: Array<LatLngLiteral>): number {
    let distance: number = 0;
    for (let i = 0; i < points.length; i++) {
      if (i == (points.length - 1)) {
        break;
      }
      distance += ChallengeModal.caclulateDistanceBetweenPositions(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
    }
    return Number(distance.toFixed(2));
  }

  private static caclulateDistanceBetweenPositions(lat1: number, lon1: number, lat2: number, lon2: number): number {
    let R = 6371; // km
    let dLat = (lat2 - lat1) * (Math.PI / 180);
    let dLon = (lon2 - lon1) * (Math.PI / 180);
    lat1 = lat1 * (Math.PI / 180);
    lat2 = lat2 * (Math.PI / 180);

    let a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    let d = R * c;

    return d;
  }

  private sendRequest(): void {
    let points: any[] = [];
    this.paths.forEach((point) => {
      point = this.renameKeyName(point, "lat", "x");
      point = this.renameKeyName(point, "lng", "y");
      points.push(point);
    });

    let routeDto: any = {
      name: this.currentUser.name,
      points: points
    };
    this._stompService.publish(`/app/request/${this.user.label}`, JSON.stringify(routeDto));
    this.isRequestSent = true;
  }

  private acceptRequest(): void {
    let routeDto: any = {
      name: this.currentUser.name,
      points: this.request.route.points,
      accepted: true
    };

    console.log(this.request.route.name);
    this._stompService.publish(`/app/request/${this.request.route.name}`, JSON.stringify(routeDto));
    this.aroundMeSubscription(this.request.route.name);
    this.isRequestAccepted = true;
    this.googleMapsProvider.map.setZoom(20);
    this.googleMapsProvider.centerToMyLocation();
  }

  private renameKeyName(obj, oldName, newName) {
    const clone = _.cloneDeep(obj);
    const keyVal = clone[oldName];

    delete clone[oldName];
    clone[newName] = keyVal;

    return clone;
  }

  private aroundMeSubscription(username) {
    let aroundMeSubscription = this._stompService.subscribe(`/app/around/${username}`);
    aroundMeSubscription.map((message: any) => {
      return message.body;
    }).subscribe((msg_body: string) => {
      this.markers = [];
      JSON.parse(msg_body).forEach((location: IUserLocation) => {
        if (location.username === username){
          let marker: any = {};
          marker.lat = location.position.x;
          marker.lng = location.position.y;
          marker.label = location.username;
          this.markers.push(marker);
        }
      })
    });
  }

  private handleAcceptConfirmation(request) {
    console.log("ACCEPTED", request);
    this.googleMapsProvider.map.setZoom(20);
    this.googleMapsProvider.centerToMyLocation();
    this.isRequestAccepted = true;
    this.isRequestSent = false;
    console.log(this.isRequestSent);
    this.aroundMeSubscription(request.route.name);
  }

  private acceptSubscription() {
    let acceptSubscription = this._stompService.subscribe(`/topic/requests/${this.currentUser.name}`);
    acceptSubscription.map((message: any) => {
      return message.body;
    }).subscribe((msg_body: string) => {
      let response: any = JSON.parse(msg_body);
      if(response.route.accepted) {
        console.log("ACCEPTED");
        this.handleAcceptConfirmation(response);
      }
      });
  }
}
