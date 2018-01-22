import {Component, ElementRef, ViewChild} from '@angular/core';
import {NavController, NavParams, Platform} from 'ionic-angular';
import {Routes} from '../../pages/routes/routes';
import {ProfileService} from '../../providers/profile/profile-service';
import {ViewUtilities} from '../../providers/view-utilities/view-utilities';
import {GoogleMapsProvider} from "../../providers/google-maps/google-maps";
import {IPoint, IRoute} from "../routes/RouteModel";
import {LatLngLiteral, GoogleMapsAPIWrapper, AgmMap} from '@agm/core';
import {Http, Headers, RequestOptions} from '@angular/http';
import {Observable} from 'rxjs/Observable';
import * as _ from "lodash";

declare let google: any;


@Component({
  selector: 'page-route-view',
  templateUrl: 'route-view.html'
})
export class RouteViewPage {

  @ViewChild(AgmMap) mapElement: AgmMap;
  @ViewChild('pleaseConnect') pleaseConnect: ElementRef;
  private markers: any = [];
  private drawingManager: any;
  private paths: Array<LatLngLiteral> = [];
  private map: GoogleMapsAPIWrapper;
  private placeIdArray = [];
  private snappedCoordinates = [];
  private selectedRoute?: IRoute;
  private route: IRoute;
  private submitted = false;

  constructor(public navCtrl: NavController,
              public navParams: NavParams,
              public viewUtilities: ViewUtilities,
              private profileService: ProfileService,
              public platform: Platform,
              public googleMapsProvider: GoogleMapsProvider,
              private http: Http) {
    this.selectedRoute = navParams.get('route')
    this.route = <IRoute> {}
    this.route.points = [];
  }

  public ionViewDidLoad(): void {

    this.platform.ready().then(() => {
      this.googleMapsProvider.init(this.mapElement, this.pleaseConnect.nativeElement);
      if (this.selectedRoute) {
        this.route = this.selectedRoute;
        this.selectedRoute.points.forEach((point) => {
          point = this.renameKeyName(point, "x", "lat");
          point = this.renameKeyName(point, "y", "lng");
          this.paths.push(<any> point);
        });
        this.mapElement.triggerResize().then(() => {
          let center = {lat:this.paths[this.paths.length -1].lat, lng: this.paths[0].lng};
          this.map.setCenter(center);
          this.map.panTo(center);
        });
      }
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


  public saveRoute(form) {
    this.submitted = true;

    if (form.valid) {
      this.viewUtilities.presentLoading();
      console.log(this.route)
      this.profileService.createRoute(this.route).subscribe(
        updatedData => {
          this.viewUtilities.presentToast("Route saved!");
          this.viewUtilities.dismissLoading();
          this.navCtrl.push(Routes)
        },
        err => {
          this.onError(err);
        }
      )
    }
  }

  private onError(err) {
    this.viewUtilities.dismissLoading();
    this.viewUtilities.presentToast(<any>err);
  }

  private runSnapToRoad(path) {
    this.paths = [];
    let pathValues = [];
    for (let i = 0; i < path.getLength(); i++) {
      pathValues.push(path.getAt(i).toUrlValue());
    }

    this.http.get('https://roads.googleapis.com/v1/snapToRoads?path=' + pathValues.join('|') + '&interpolate=true&key=AIzaSyAc1FP_Vf1BCmuCqo47pM5HUcrA9kiVcrI')
      .subscribe((res => {
        console.log(res.json())
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

      let point: any = {};
      point.x = data.snappedPoints[i].location.latitude;
      point.y = data.snappedPoints[i].location.longitude;
      this.route.points.push(point);
    }
    this.mapElement.triggerResize().then(() => {
      let center = {lat:data.snappedPoints[data.snappedPoints.length -1].location.latitude, lng: data.snappedPoints[0].location.longitude};
      this.map.setCenter(center);
      this.map.panTo(center);
      if(data.warningMessage) {
        this.viewUtilities.presentToast(data.warningMessage);
      }
    });
  }

  private renameKeyName(obj, oldName, newName) {
    const clone = _.cloneDeep(obj);
    const keyVal = clone[oldName];

    delete clone[oldName];
    clone[newName] = keyVal;

    return clone;
  }

}
