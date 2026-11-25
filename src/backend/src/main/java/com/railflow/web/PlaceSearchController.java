package com.railflow.web;

import java.util.regex.Pattern;
import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("web")
public class PlaceSearchController {

    private static final Pattern OUTER_WHITESPACE = Pattern.compile(
            "\\A\\s++|(?<!\\s)\\s++\\z", Pattern.UNICODE_CHARACTER_CLASS);
    private final AmapPlaceSearch search;

    public PlaceSearchController(AmapPlaceSearch search) {
        this.search = search;
    }

    @GetMapping("/api/places")
    public ResponseEntity<AmapPlaceSearch.Results> places(@RequestParam(name = "q", required = false) String query) {
        String stripped = query == null ? null : OUTER_WHITESPACE.matcher(query).replaceAll("");
        var results = search.search(Params.requireText(stripped, "q", 64));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(results);
    }
}
