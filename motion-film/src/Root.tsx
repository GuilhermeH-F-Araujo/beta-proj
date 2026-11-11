import {Composition, Folder} from 'remotion';
import {Film} from './Film';
import {Animatic} from './Animatic';
import {Impact} from './Impact';
import {Machine} from './Machine';
import {Problem} from './Problem';
import {Solution} from './Solution';
import {Product} from './Product';
import {Reaction} from './Reaction';
import {Brand} from './Brand';
export const Root = () => <>
 <Composition id="EstacaoMotos" component={Film} durationInFrames={1800} fps={30} width={1080} height={1920}/>
 <Composition id="Animatic" component={Animatic} durationInFrames={1800} fps={30} width={1080} height={1920}/>
 <Folder name="Scenes">
 <Composition id="Impact" component={Impact} durationInFrames={180} fps={30} width={1080} height={1920}/>
 <Composition id="Machine" component={Machine} durationInFrames={210} fps={30} width={1080} height={1920}/>
 <Composition id="Problem" component={Problem} durationInFrames={240} fps={30} width={1080} height={1920}/>
 <Composition id="Solution" component={Solution} durationInFrames={270} fps={30} width={1080} height={1920}/>
 <Composition id="Product" component={Product} durationInFrames={390} fps={30} width={1080} height={1920}/>
 <Composition id="Reaction" component={Reaction} durationInFrames={300} fps={30} width={1080} height={1920}/>
 <Composition id="Brand" component={Brand} durationInFrames={210} fps={30} width={1080} height={1920}/>
 </Folder></>;
