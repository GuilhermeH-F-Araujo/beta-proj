import {Config} from '@remotion/cli/config';
import path from 'node:path';
import webpack from 'webpack';
Config.overrideWebpackConfig((config)=>({...config,resolve:{...config.resolve,alias:{...config.resolve?.alias,'/assets':path.resolve('public/assets'),react:path.resolve('node_modules/react'),'react-dom':path.resolve('node_modules/react-dom'),'react-router-dom':path.resolve('../client/node_modules/react-router-dom')}},plugins:[...(config.plugins??[]),new webpack.DefinePlugin({'import.meta.env':'({VITE_API_URL:""})'})]}));
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
