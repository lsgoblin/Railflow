package com.railflow.web;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.railflow.common.GlobalExceptionHandler;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class PlaceSearchControllerTest {

    private final AmapPlaceSearch search = mock(AmapPlaceSearch.class);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new PlaceSearchController(search))
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();

    @ParameterizedTest
    @ValueSource(strings = {" ", "\u3000", "\u00a0", "\t\u3000\u202f"})
    void rejectsBlankQueriesBeforeInvokingPlaceSearch(String query) throws Exception {
        mvc.perform(get("/api/places").param("q", query))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_FAILED"));

        verifyNoInteractions(search);
    }

    @Test
    void trimsUnicodeWhitespaceAtTheEdgesAndKeepsItInsideTheQuery() throws Exception {
        String keyword = "北京\u3000故宫";
        when(search.search(keyword)).thenReturn(new AmapPlaceSearch.Results("AMAP", "GCJ-02", List.of()));

        mvc.perform(get("/api/places").param("q", "\u3000 " + keyword + "\u00a0\t"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source").value("AMAP"));
    }
}
