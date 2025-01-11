using Microsoft.JSInterop;
using System.Text.Json;
using SilentEar.Models;

namespace SilentEar.Services;

public class LocalStorageService
{
    private readonly IJSRuntime _jsRuntime;
    private const string RECORDINGS_KEY = "silentear_recordings";

    public LocalStorageService(IJSRuntime jsRuntime)
    {
        _jsRuntime = jsRuntime;
    }

    public async Task SaveRecordingsAsync(List<SoundSegment> recordings)
    {
        var json = JsonSerializer.Serialize(recordings);
        await _jsRuntime.InvokeVoidAsync("localStorage.setItem", RECORDINGS_KEY, json);
    }

    public async Task<List<SoundSegment>> LoadRecordingsAsync()
    {
        var json = await _jsRuntime.InvokeAsync<string>("localStorage.getItem", RECORDINGS_KEY);
        if (string.IsNullOrEmpty(json))
            return new List<SoundSegment>();

        return JsonSerializer.Deserialize<List<SoundSegment>>(json) ?? new List<SoundSegment>();
    }
}