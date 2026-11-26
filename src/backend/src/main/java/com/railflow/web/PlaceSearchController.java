package com.railflow.web;

import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("web")
public class PlaceSearchController {

    private final AmapPlaceSearch search;

    public PlaceSearchController(AmapPlaceSearch search) {
        this.search = search;
    }

    @GetMapping("/api/places")
    public ResponseEntity<AmapPlaceSearch.Results> places(@RequestParam(name = "q", required = false) String query) {
        String stripped = Params.trimUnicodeWhitespace(query);
        var results = search.search(Params.requireText(stripped, "q", 64));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(results);
    }
}
