import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { createClient } from '@supabase/supabase-js';
import { installNative } from './runtime.mjs';
const WorkoutBackup=registerPlugin('WorkoutBackup');
if(Capacitor.isNativePlatform())installNative({win:window,App,Browser,createClient,WorkoutBackup});
