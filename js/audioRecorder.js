let mediaStream;
let mediaRecorder;
let isMonitoring = false;
let dotNetHelper;
let currentAudio = null;
let db = null;

window.audioRecorder = {
    requestPermission: async function () {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (error) {
            console.error('Error requesting permission:', error);
            return false;
        }
    },

    startMonitoring: async function (dotNetRef, threshold) {
        dotNetHelper = dotNetRef;
        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioContext = new AudioContext();
            const analyzer = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(mediaStream);
            source.connect(analyzer);
            
            isMonitoring = true;
            this.checkAudioLevel(analyzer, threshold);
        } catch (error) {
            console.error('Error starting monitoring:', error);
        }
    },

    stopMonitoring: function () {
        isMonitoring = false;
        if (mediaRecorder?.state === 'recording') {
            mediaRecorder.stop();
        }
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
        }
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }
        mediaStream = null;
        mediaRecorder = null;
        dotNetHelper.invokeMethodAsync('OnRecordingStatusChange', false);
    },

    checkAudioLevel: function (analyzer, threshold) {
        if (!isMonitoring) return;

        const dataArray = new Uint8Array(analyzer.frequencyBinCount);
        analyzer.getByteTimeDomainData(dataArray);
        
        const average = dataArray.reduce((sum, value) => sum + Math.abs(value - 128), 0) / dataArray.length;

        if (average > threshold && !mediaRecorder) {
            this.startRecording();
        }

        requestAnimationFrame(() => this.checkAudioLevel(analyzer, threshold));
    },

    startRecording: function () {
        if (!mediaStream) return;
        
        const chunks = [];
        mediaRecorder = new MediaRecorder(mediaStream);
        const timestamp = new Date();
        const recordingId = `recording_${Date.now()}`;
        
        mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
        
        mediaRecorder.onstart = () => {
            dotNetHelper.invokeMethodAsync('OnRecordingStatusChange', true);
        };
        
        mediaRecorder.onstop = async () => {
            dotNetHelper.invokeMethodAsync('OnRecordingStatusChange', false);
            const blob = new Blob(chunks, { type: 'audio/webm' });
            
            await this.storeRecording(recordingId, blob);
            dotNetHelper.invokeMethodAsync('OnSoundRecorded', recordingId, timestamp);
        };
        
        mediaRecorder.start();
        setTimeout(() => mediaRecorder?.state === 'recording' && mediaRecorder.stop(), 30000);
    },

    initDB: async function() {
        if (db) return db;
        
        return new Promise((resolve, reject) => {
            const dbRequest = indexedDB.open('SilentEarDB', 1);
            
            dbRequest.onerror = () => reject(dbRequest.error);
            
            dbRequest.onsuccess = () => {
                db = dbRequest.result;
                resolve(db);
            };
            
            dbRequest.onupgradeneeded = (event) => {
                const database = event.target.result;
                if (!database.objectStoreNames.contains('recordings')) {
                    database.createObjectStore('recordings');
                }
            };
        });
    },

    storeRecording: async function(id, blob) {
        await this.initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['recordings'], 'readwrite');
            const store = transaction.objectStore('recordings');
            const request = store.put(blob, id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    loadRecording: async function(id) {
        await this.initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['recordings'], 'readonly');
            const store = transaction.objectStore('recordings');
            const request = store.get(id);
            
            request.onsuccess = () => {
                const blob = request.result;
                if (blob) {
                    resolve(URL.createObjectURL(blob));
                } else {
                    reject(new Error('Recording not found'));
                }
            };
            request.onerror = () => reject(request.error);
        });
    },

    deleteRecording: async function(id) {
        await this.initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['recordings'], 'readwrite');
            const store = transaction.objectStore('recordings');
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    playRecording: async function (recordingId) {
        try {
            if (currentAudio) {
                currentAudio.pause();
                currentAudio.currentTime = 0;
                currentAudio = null;
                dotNetHelper.invokeMethodAsync('OnPlaybackEnded');
                return;
            }

            const audioUrl = await this.loadRecording(recordingId);
            currentAudio = new Audio(audioUrl);
            await currentAudio.play();
            
            currentAudio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                currentAudio = null;
                dotNetHelper.invokeMethodAsync('OnPlaybackEnded');
            };
        } catch (error) {
            console.error('Error playing recording:', error);
            currentAudio = null;
        }
    },

    revokeObjectURL: async function (id) {
        try {
            await this.deleteRecording(id);
        } catch (error) {
            console.error('Error deleting recording:', error);
        }
    }
};