import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { createClient } from '@supabase/supabase-js';
import { installNative } from './runtime.mjs';
const WorkoutBackup=registerPlugin('WorkoutBackup');
const VoiceCommand=registerPlugin('VoiceCommand');
// If the native side lacks AppUpdate (an APK built without it), the client falls back to a browser download.
const AppUpdate=Capacitor.isPluginAvailable('AppUpdate')?registerPlugin('AppUpdate'):null;
if(Capacitor.isNativePlatform())installNative({win:window,App,Browser,createClient,WorkoutBackup,VoiceCommand,AppUpdate});
