import {registerRoot,Still} from 'remotion';
import {ScreenMoto,ScreenOrders,ScreenHistory} from './ProductScreens';
const UI=()=><><Still id="ScreenMoto" component={ScreenMoto} width={1440} height={1000}/><Still id="ScreenOrders" component={ScreenOrders} width={1440} height={1000}/><Still id="ScreenHistory" component={ScreenHistory} width={1440} height={1000}/></>;
registerRoot(UI);
