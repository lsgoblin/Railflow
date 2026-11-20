package com.railflow.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.context.annotation.Profile;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Makes the UTF-8 charset of JSON responses explicit ({@code application/json;charset=UTF-8}).
 *
 * <p>JSON is UTF-8 by definition, but some legacy HTTP clients on Windows assume a local code page
 * when the charset parameter is absent and then display mojibake for Chinese names. The MVP
 * contract requires UTF-8 JSON responses, so the charset is stated explicitly.
 */
@Component
@Profile("web")
@Order(Ordered.HIGHEST_PRECEDENCE)
public class JsonCharsetFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        response.setCharacterEncoding("UTF-8");
        filterChain.doFilter(request, response);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path == null || !path.startsWith("/api/");
    }
}
